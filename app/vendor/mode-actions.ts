"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";

// In-person sales logged at a physical event -- separate from
// orders/order_items (no payment-proof/review flow), decrements stock
// immediately. Online order approval (app/admin/orders/actions.ts)
// deliberately doesn't touch stock at all today; this auto-decrement is
// specific to Vendor Mode, not a change to that existing behavior.
export async function recordOfflineSale(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const artistId = formData.get("artistId");
  const productId = formData.get("productId");
  const variantId = formData.get("variantId");
  const quantityRaw = formData.get("quantity");
  if (typeof artistId !== "string" || typeof productId !== "string" || typeof variantId !== "string") return;
  if (session.role === "vendor" && artistId !== session.artistId) return;

  const quantity = Math.max(1, Math.floor(Number(quantityRaw) || 1));

  const supabase = createAdminClient();

  // Re-derive price/stock and confirm the variant actually belongs to this
  // artist's product from the DB -- never trust a submitted price.
  const { data: variant } = await supabase
    .from("product_variants")
    .select("id, price, stock, product_id, products!inner(artist_id)")
    .eq("id", variantId)
    .eq("product_id", productId)
    .maybeSingle<{ id: string; price: number; stock: number; product_id: string; products: { artist_id: string } }>();
  if (!variant || variant.products.artist_id !== artistId) return;

  const { error: insertError } = await supabase.from("offline_sales").insert({
    artist_id: artistId,
    product_id: productId,
    variant_id: variantId,
    quantity,
    unit_price: variant.price,
  });
  if (insertError) {
    console.error("Failed to record offline sale:", insertError);
    return;
  }

  const newStock = Math.max(0, variant.stock - quantity);
  await supabase.from("product_variants").update({ stock: newStock }).eq("id", variantId);

  revalidatePath("/vendor/mode");
  revalidatePath("/vendor");
}
