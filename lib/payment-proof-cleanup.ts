import type { createAdminClient } from "./supabase-admin";

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;
const LIST_PAGE_SIZE = 1000;

type CleanupResult = { deletedPaths: string[] };

// Catches payment-proof uploads that never got attached to an order at
// all -- a customer uploads a screenshot via /api/upload-payment-proof,
// then abandons checkout before placeOrder ever runs (network error,
// changed their mind, whatever). Nothing else in the app ever revisits
// those files, so without this they'd sit in the private bucket forever.
//
// Deliberately scoped to files no order references at all, regardless of
// that order's status -- an order's own proof is instead deleted
// immediately the moment it goes rejected/cancelled/out_of_stock (see
// PROOF_CLEANUP_STATUSES in app/admin/orders/actions.ts), not swept here.
// That keeps this function unable to ever touch a file that's still in
// use, no matter what changes on the order side.
//
// The grace period exists so a customer who's uploaded but hasn't
// submitted the checkout form yet never has their in-flight upload swept
// out from under them mid-purchase.
export async function runPaymentProofCleanupTick(
  supabase: ReturnType<typeof createAdminClient>,
  now: Date = new Date()
): Promise<CleanupResult> {
  const referenced = new Set<string>();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("payment_proof_url")
    .not("payment_proof_url", "is", null);
  if (ordersError) {
    console.error("Failed to load referenced payment proofs:", ordersError);
    return { deletedPaths: [] };
  }
  for (const row of orders as { payment_proof_url: string | null }[]) {
    if (row.payment_proof_url) referenced.add(row.payment_proof_url);
  }

  const objects: { name: string; created_at: string | null }[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .list("", { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error) {
      console.error("Failed to list payment-proofs bucket:", error);
      break;
    }
    if (!data || data.length === 0) break;
    objects.push(...data.map((f) => ({ name: f.name, created_at: f.created_at ?? null })));
    if (data.length < LIST_PAGE_SIZE) break;
  }

  const cutoff = now.getTime() - GRACE_PERIOD_MS;
  const orphaned = objects.filter((obj) => {
    if (referenced.has(obj.name)) return false;
    // Can't confirm age without a created_at -- leave it alone rather
    // than guess and risk deleting something mid-upload.
    if (!obj.created_at) return false;
    return new Date(obj.created_at).getTime() < cutoff;
  });
  if (orphaned.length === 0) return { deletedPaths: [] };

  const { error: removeError } = await supabase.storage
    .from("payment-proofs")
    .remove(orphaned.map((o) => o.name));
  if (removeError) {
    console.error("Failed to delete orphaned payment proofs:", removeError);
    return { deletedPaths: [] };
  }

  return { deletedPaths: orphaned.map((o) => o.name) };
}
