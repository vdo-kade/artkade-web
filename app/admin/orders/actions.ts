"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCachedUser } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { restoreStock } from "@/lib/stock";
import type { ActionState } from "@/lib/action-state";

type OrderStatus = keyof typeof ORDER_STATUS_LABELS;

// Was missing entirely -- every other admin/vendor action in this app
// re-derives the caller's role and bounces a dead session to login rather
// than silently no-opping (see app/vendor/actions.ts for the original
// reasoning). This one used the service-role client directly with no check
// at all, so it ran for anyone regardless of session state.
//
// Every transition writes both the orders row itself and a row in
// order_status_history -- that history table used to be write-only (rows
// went in on approve/reject but nothing ever read them back); the order
// detail cards in ./page.tsx now render it as a simple timeline.
//
// reviewed_by/reviewed_at are only stamped on the actual review step
// (approve/reject), not on later fulfillment transitions (shipped,
// delivered, etc) -- they record who made the approve/reject call, not
// "whoever last touched this order." Fulfillment is centralized to one
// admin (see app/vendor/label/[orderId]/page.tsx's RETURN_ADDRESS comment),
// so every transition here stays admin-only, same as approve/reject always
// were.
async function transitionOrderStatus(orderId: string, status: OrderStatus): Promise<ActionState> {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const supabase = createAdminClient();
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

  revalidatePath("/admin/orders");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function approveOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return transitionOrderStatus(orderId, "approved");
}

// Rejecting an order releases the stock reservation placeOrder took at
// checkout (see app/checkout/actions.ts) -- online orders now reserve
// stock the moment they're placed, not just when approved, so a rejected
// one has to give that stock back or it's locked away for nothing.
// Checking the order's status before transitioning (rather than after) is
// the actual guard against double-restoring if this ever runs twice on
// the same order: only a genuine awaiting_review -> rejected transition
// ever had a reservation to release in the first place.
export async function rejectOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };

  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
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
