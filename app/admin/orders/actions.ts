"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCachedUser } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { restoreStock } from "@/lib/stock";
import { deletePaymentProof } from "@/lib/storage";
import { sendOrderApprovedEmail, sendOrderRejectedEmail } from "@/lib/email";
import type { ActionState } from "@/lib/action-state";

type OrderStatus = keyof typeof ORDER_STATUS_LABELS;

// An order landing in any of these is done for good -- it'll never be
// approved/shipped/delivered after this, so its payment-proof screenshot
// has no further purpose and gets deleted right away instead of sitting
// in the private bucket forever. Deliberately not "delivered": that's a
// successful, completed order, and its proof stays as a record.
const PROOF_CLEANUP_STATUSES = new Set<OrderStatus>(["rejected", "cancelled", "out_of_stock"]);

const NOT_YOUR_STALL_ERROR =
  "This order includes items from another stall -- only Art Kade staff can act on it.";

// A vendor can act on an order only if every line item in it belongs to
// their own stall -- an order mixing items from multiple stalls stays
// admin-only, since one vendor shouldn't unilaterally decide the fate of
// another vendor's items just because they happened to land in the same
// cart. Checked fresh against order_items -> products.artist_id every
// call, never trusted from anything client-submitted. An order with no
// items at all (shouldn't happen, but defensively) fails closed.
async function vendorOwnsWholeOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  artistId: string
): Promise<boolean> {
  const { data: items, error } = await supabase
    .from("order_items")
    .select("products(artist_id)")
    .eq("order_id", orderId)
    .returns<{ products: { artist_id: string } | null }[]>();
  if (error || !items || items.length === 0) return false;
  return items.every((item) => item.products?.artist_id === artistId);
}

// Single funnel every order action goes through for authorization -- admin
// is unscoped, vendor is scoped to vendorOwnsWholeOrder above. A dead
// session bounces to login (see app/vendor/actions.ts for the original
// "why redirect instead of no-op" reasoning); an authenticated caller who
// just isn't allowed to touch *this* order gets a real inline error
// instead, since that's a normal, expected outcome for a vendor browsing
// mixed-stall orders, not a broken session.
async function authorizeOrderAction(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");
  if (session.role === "admin") return { ok: true };
  const allowed = await vendorOwnsWholeOrder(supabase, orderId, session.artistId);
  return allowed ? { ok: true } : { ok: false, error: NOT_YOUR_STALL_ERROR };
}

// Every transition writes both the orders row itself and a row in
// order_status_history -- that history table used to be write-only (rows
// went in on approve/reject but nothing ever read them back); the order
// detail cards in ./page.tsx and the vendor Tracker now both render it as
// a simple timeline.
//
// reviewed_by/reviewed_at are only stamped on the actual review step
// (approve/reject), not on later fulfillment transitions (shipped,
// delivered, etc) -- they record who made the approve/reject call, not
// "whoever last touched this order."
async function transitionOrderStatus(orderId: string, status: OrderStatus): Promise<ActionState> {
  const supabase = createAdminClient();
  const auth = await authorizeOrderAction(supabase, orderId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const isReviewStep = status === "approved" || status === "rejected";

  const updates: { status: OrderStatus; reviewed_at?: string; reviewed_by?: string | null } = { status };
  if (isReviewStep) {
    updates.reviewed_at = new Date().toISOString();
    const {
      data: { user },
    } = await getCachedUser();
    updates.reviewed_by = user?.email ?? null;
  }

  const { error: updateError } = await supabase.from("orders").update(updates).eq("id", orderId);
  if (updateError) {
    console.error("Failed to update order status:", updateError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({ order_id: orderId, status });
  if (historyError) console.error("Failed to record order status history:", historyError);

  if (PROOF_CLEANUP_STATUSES.has(status)) {
    const { data: current } = await supabase
      .from("orders")
      .select("payment_proof_url")
      .eq("id", orderId)
      .maybeSingle();
    if (current?.payment_proof_url) await deletePaymentProof(supabase, current.payment_proof_url);
  }

  revalidatePath("/admin/orders");
  revalidatePath("/vendor");
  return { ok: true };
}

// Sends the "Confirmation email" the homepage's own "how it works" section
// already promises (app/page.tsx's STEPS: "You'll get an email once it's
// approved") -- fire-and-log, not fire-and-fail: an email hiccup shouldn't
// turn a real, successful approval into an error response for the admin,
// same reasoning as order_status_history's own insert above.
export async function approveOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };

  const supabase = createAdminClient();
  const auth = await authorizeOrderAction(supabase, orderId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, customer_email")
    .eq("id", orderId)
    .maybeSingle();

  const result = await transitionOrderStatus(orderId, "approved");

  if (result?.ok && order) {
    try {
      await sendOrderApprovedEmail({ to: order.customer_email, orderNumber: order.order_number });
    } catch (err) {
      console.error("Failed to send order-approved email:", err);
    }
  }

  return result;
}

// Rejecting an order releases the stock reservation placeOrder took at
// checkout (see app/checkout/actions.ts) -- online orders now reserve
// stock the moment they're placed, not just when approved, so a rejected
// one has to give that stock back or it's locked away for nothing.
// Checking the order's status before transitioning (rather than after) is
// the actual guard against double-restoring if this ever runs twice on
// the same order: only a genuine awaiting_review -> rejected transition
// ever had a reservation to release in the first place.
//
// Also sends the rejection email -- fire-and-log like approveOrder's, not
// fire-and-fail.
export async function rejectOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };

  const supabase = createAdminClient();
  const auth = await authorizeOrderAction(supabase, orderId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: existing } = await supabase
    .from("orders")
    .select("status, order_number, customer_email")
    .eq("id", orderId)
    .maybeSingle();
  const hadReservedStock = existing?.status === "awaiting_review";

  const result = await transitionOrderStatus(orderId, "rejected");

  if (result?.ok && hadReservedStock) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("variant_id, quantity")
      .eq("order_id", orderId);
    if (itemsError) {
      console.error("Failed to load order items for stock restoration:", itemsError);
    } else {
      for (const item of items as { variant_id: string | null; quantity: number }[]) {
        // variant_id is nullable in the schema (order_items can in theory
        // reference a variant-less product) -- nothing to restore for a
        // line that never had one.
        if (item.variant_id) await restoreStock(supabase, item.variant_id, item.quantity);
      }
    }
  }

  if (result?.ok && existing) {
    try {
      await sendOrderRejectedEmail({ to: existing.customer_email, orderNumber: existing.order_number });
    } catch (err) {
      console.error("Failed to send order-rejected email:", err);
    }
  }

  return result;
}

export async function markShipped(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return transitionOrderStatus(orderId, "shipped");
}

export async function markDelivered(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return transitionOrderStatus(orderId, "delivered");
}

export async function markCancelled(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return transitionOrderStatus(orderId, "cancelled");
}

export async function markOutOfStock(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return transitionOrderStatus(orderId, "out_of_stock");
}

// internal_notes is plain staff scratch space (private, never shown to the
// customer -- see supabase/schema.sql) -- overwritten wholesale rather than
// appended, same "one textarea, one Save" pattern as every other free-text
// field in this app (stall bio, magazine body, etc).
export async function updateInternalNotes(formData: FormData): Promise<ActionState> {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const orderId = formData.get("orderId");
  const notes = formData.get("notes");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ internal_notes: typeof notes === "string" && notes.trim() ? notes.trim() : null })
    .eq("id", orderId);
  if (error) {
    console.error("Failed to save internal notes:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin/orders");
  return { ok: true };
}
