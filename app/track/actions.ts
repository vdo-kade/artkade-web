"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { ORDER_NUMBER_PATTERN } from "@/lib/orders";

export type TrackedItem = { name: string; variantLabel: string | null; quantity: number; unitPrice: number };
export type TrackedHistoryEntry = { status: string; createdAt: string };
export type TrackedOrder = {
  orderNumber: string;
  status: string;
  createdAt: string;
  totalAmount: number;
  shippingMethod: string | null;
  isBulk: boolean;
  items: TrackedItem[];
  history: TrackedHistoryEntry[];
};
export type TrackResult = { ok: true; order: TrackedOrder } | { ok: false; error: string };

type OrderRow = {
  order_number: string;
  customer_email: string;
  status: string;
  created_at: string;
  total_amount: number;
  shipping_method: string | null;
  is_bulk: boolean;
  order_items: {
    quantity: number;
    unit_price: number;
    products: { name: string } | null;
    product_variants: { label: string } | null;
  }[];
  order_status_history: { status: string; created_at: string }[];
};

// Deliberately the exact same response whether the order number doesn't
// exist at all or it exists but the email doesn't match -- anything more
// specific ("wrong email" vs "no such order") would let a guesser
// binary-search which half of the pair they got right. RLS blocks anon
// reads of orders entirely on purpose (see supabase/schema.sql), so this
// is the one place either factor is actually checked, server-side against
// the service-role client.
const NOT_FOUND_ERROR =
  "We couldn't find an order matching that order number and email. Double-check both and try again.";

export async function lookupOrder(formData: FormData): Promise<TrackResult> {
  const orderNumberRaw = formData.get("orderNumber");
  const emailRaw = formData.get("email");
  if (typeof orderNumberRaw !== "string" || typeof emailRaw !== "string" || !emailRaw.trim()) {
    return { ok: false, error: "Enter your order number and email." };
  }

  const orderNumber = orderNumberRaw.trim().toUpperCase();
  const email = emailRaw.trim().toLowerCase();
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    // A malformed order number can never match a real row -- same generic
    // response as a real miss, not a format-specific hint.
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  // This form is exactly the kind of thing a script could hammer to guess
  // valid order-number/email pairs -- same brute-force shape as the /gate
  // password, so it gets the same treatment (see lib/rate-limit.ts).
  const ip = await getClientIp();
  if (!checkRateLimit(`track-order:${ip}`, 8, 10 * 60 * 1000)) {
    return { ok: false, error: "Too many attempts. Please try again in a few minutes." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `order_number, customer_email, status, created_at, total_amount, shipping_method, is_bulk,
       order_items ( quantity, unit_price, products ( name ), product_variants ( label ) ),
       order_status_history ( status, created_at )`
    )
    .eq("order_number", orderNumber)
    .returns<OrderRow[]>();

  if (error) {
    console.error("Failed to look up order:", error);
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  // order_number is unique (see supabase/schema.sql), so at most one row.
  const order = data?.[0];
  if (!order || order.customer_email.trim().toLowerCase() !== email) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  return {
    ok: true,
    order: {
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at,
      totalAmount: order.total_amount,
      shippingMethod: order.shipping_method,
      isBulk: order.is_bulk,
      items: order.order_items.map((item) => ({
        name: item.products?.name ?? "(deleted product)",
        variantLabel: item.product_variants?.label ?? null,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })),
      history: [...order.order_status_history]
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((h) => ({ status: h.status, createdAt: h.created_at })),
    },
  };
}
