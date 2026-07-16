"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import type { ActionState } from "@/lib/action-state";

// Was missing entirely -- every other admin/vendor action in this app
// re-derives the caller's role and bounces a dead session to login rather
// than silently no-opping (see app/vendor/actions.ts for the original
// reasoning). This one used the service-role client directly with no check
// at all, so it ran for anyone regardless of session state.
async function setOrderStatus(orderId: string, status: "approved" | "rejected"): Promise<ActionState> {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const supabase = createAdminClient();
  const reviewed_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status, reviewed_at })
    .eq("id", orderId);
  if (updateError) {
    console.error("Failed to update order status:", updateError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({ order_id: orderId, status });
  if (historyError) console.error("Failed to record order status history:", historyError);

  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function approveOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return setOrderStatus(orderId, "approved");
}

export async function rejectOrder(formData: FormData): Promise<ActionState> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return { ok: false, error: "Missing order." };
  return setOrderStatus(orderId, "rejected");
}
