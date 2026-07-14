"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";

async function setOrderStatus(orderId: string, status: "approved" | "rejected") {
  const supabase = createAdminClient();
  const reviewed_at = new Date().toISOString();

  await supabase.from("orders").update({ status, reviewed_at }).eq("id", orderId);
  await supabase.from("order_status_history").insert({ order_id: orderId, status });

  revalidatePath("/admin/orders");
}

export async function approveOrder(formData: FormData) {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return;
  await setOrderStatus(orderId, "approved");
}

export async function rejectOrder(formData: FormData) {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") return;
  await setOrderStatus(orderId, "rejected");
}
