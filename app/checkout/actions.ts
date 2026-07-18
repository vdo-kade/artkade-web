"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { decrementStock, restoreStock } from "@/lib/stock";

const MIN_ORDER_TOTAL = 1350;

export type CheckoutItemInput = { variantId: string; quantity: number };

export type CheckoutResult = { ok: true; orderNumber: string } | { ok: false; error: string };

type VariantRow = {
  id: string;
  price: number;
  stock: number;
  is_active: boolean;
  product_id: string;
  products: { is_active: boolean } | null;
};

// The one place an order actually gets created -- checkout used to insert
// straight from the browser via the anon client, trusting whatever price
// and total the client's own (localStorage-backed) bag state claimed. This
// re-derives everything that matters from the DB instead:
//   - price/total: read fresh from product_variants, never from the client
//   - stock: actually decremented here (with the CAS retry above), not
//     just checked non-zero -- this is the reservation, made at order
//     placement rather than admin approval
//   - the Rs. 1,350 minimum: enforced again server-side (checkout's own JS
//     check is real, but only ever a client-side convenience, easily
//     bypassed by anyone not going through the browser UI at all)
// The client sends only { variantId, quantity } per line -- there's no
// price field to "trust" or ignore in the first place.
export async function placeOrder(input: {
  items: CheckoutItemInput[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  customerNotes: string | null;
  paymentProofPath: string;
  orderNumber: string;
}): Promise<CheckoutResult> {
  if (
    typeof input.customerName !== "string" ||
    !input.customerName.trim() ||
    typeof input.customerPhone !== "string" ||
    !input.customerPhone.trim() ||
    typeof input.shippingAddress !== "string" ||
    !input.shippingAddress.trim()
  ) {
    return { ok: false, error: "Missing required fields." };
  }
  if (typeof input.customerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (typeof input.paymentProofPath !== "string" || !input.paymentProofPath) {
    return { ok: false, error: "Missing payment proof." };
  }
  if (typeof input.orderNumber !== "string" || !/^ARTK-\d{6}$/.test(input.orderNumber)) {
    return { ok: false, error: "Invalid order reference." };
  }

  // Merge duplicate variant lines and drop anything malformed -- never
  // trust the shape of client-submitted cart data, only variantId/quantity.
  const requested = new Map<string, number>();
  for (const item of input.items ?? []) {
    if (typeof item?.variantId !== "string" || !item.variantId) continue;
    const quantity = Math.floor(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    requested.set(item.variantId, (requested.get(item.variantId) ?? 0) + quantity);
  }
  if (requested.size === 0) return { ok: false, error: "Your bag is empty." };

  const supabase = createAdminClient();

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, price, stock, is_active, product_id, products(is_active)")
    .in("id", Array.from(requested.keys()))
    .returns<VariantRow[]>();
  if (variantsError) {
    console.error("Failed to load variants for checkout:", variantsError);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const variantMap = new Map(variants.map((v) => [v.id, v]));
  for (const variantId of requested.keys()) {
    const variant = variantMap.get(variantId);
    if (!variant || !variant.is_active || !variant.products?.is_active) {
      return {
        ok: false,
        error: "One or more items in your bag are no longer available. Please refresh your bag and try again.",
      };
    }
  }

  let total = 0;
  const lineItems: { product_id: string; variant_id: string; quantity: number; unit_price: number }[] = [];
  for (const [variantId, quantity] of requested) {
    const variant = variantMap.get(variantId)!;
    lineItems.push({ product_id: variant.product_id, variant_id: variantId, quantity, unit_price: variant.price });
    total += variant.price * quantity;
  }

  if (total < MIN_ORDER_TOTAL) {
    return { ok: false, error: `Minimum order is Rs. ${MIN_ORDER_TOTAL.toLocaleString("en-US")}.` };
  }

  // Reserve stock for every line before creating the order. If any item
  // comes up short, undo whatever already succeeded -- a partial failure
  // should never leave stock silently locked away with no order to show
  // for it.
  const decremented: { variantId: string; quantity: number }[] = [];
  for (const item of lineItems) {
    const result = await decrementStock(supabase, item.variant_id, item.quantity);
    if (!result.ok) {
      for (const d of decremented) await restoreStock(supabase, d.variantId, d.quantity);
      return {
        ok: false,
        error:
          result.availableStock <= 0
            ? "Sorry, one of the items in your bag just sold out. Please update your bag and try again."
            : `Sorry, only ${result.availableStock} left of one item in your bag -- please update the quantity and try again.`,
      };
    }
    decremented.push({ variantId: item.variant_id, quantity: item.quantity });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: input.orderNumber,
      customer_name: input.customerName.trim(),
      customer_email: input.customerEmail.trim(),
      customer_phone: input.customerPhone.trim(),
      shipping_address: input.shippingAddress.trim(),
      status: "awaiting_review",
      payment_proof_url: input.paymentProofPath,
      total_amount: total,
      customer_notes: typeof input.customerNotes === "string" && input.customerNotes.trim() ? input.customerNotes.trim() : null,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    console.error("Failed to create order:", orderError);
    for (const d of decremented) await restoreStock(supabase, d.variantId, d.quantity);
    return { ok: false, error: "Something went wrong placing your order. Please try again." };
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    lineItems.map((li) => ({ ...li, order_id: order.id }))
  );
  if (itemsError) {
    console.error("Failed to create order items:", itemsError);
    // Extremely unlikely right after a successful order insert, but if it
    // happens, don't leave an empty orphaned order sitting in the admin
    // queue -- roll back both the order row and the stock reservation.
    await supabase.from("orders").delete().eq("id", order.id);
    for (const d of decremented) await restoreStock(supabase, d.variantId, d.quantity);
    return { ok: false, error: "Something went wrong placing your order. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/search");
  return { ok: true, orderNumber: input.orderNumber };
}
