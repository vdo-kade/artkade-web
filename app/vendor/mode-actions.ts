"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { decrementStock, restoreStock } from "@/lib/stock";
import type { ActionState } from "@/lib/action-state";

// In-person sales logged at a physical event -- separate from
// orders/order_items (no payment-proof/review flow), decrements stock
// immediately. Online order approval (app/admin/orders/actions.ts)
// deliberately doesn't touch stock at all today; this auto-decrement is
// specific to Vendor Mode, not a change to that existing behavior.
export async function recordOfflineSale(formData: FormData): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const artistId = formData.get("artistId");
  const productId = formData.get("productId");
  const variantId = formData.get("variantId");
  const quantityRaw = formData.get("quantity");
  const notesRaw = formData.get("notes");
  if (typeof artistId !== "string" || typeof productId !== "string" || typeof variantId !== "string") {
    return { ok: false, error: "Missing required fields." };
  }
  if (session.role === "vendor" && artistId !== session.artistId) {
    return { ok: false, error: "You don't have permission to log sales for this stall." };
  }

  const requestedQuantity = Math.max(1, Math.floor(Number(quantityRaw) || 1));
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

  const supabase = createAdminClient();

  // Re-derive price/stock and confirm the variant actually belongs to this
  // artist's product from the DB -- never trust a submitted price.
  const { data: variant } = await supabase
    .from("product_variants")
    .select("id, price, stock, product_id, products!inner(artist_id)")
    .eq("id", variantId)
    .eq("product_id", productId)
    .maybeSingle<{ id: string; price: number; stock: number; product_id: string; products: { artist_id: string } }>();
  if (!variant || variant.products.artist_id !== artistId) {
    return { ok: false, error: "That item couldn't be found." };
  }
  if (variant.stock <= 0) return { ok: false, error: "Out of stock." };

  // Never sell more than is actually left -- matters most for a one-of-one
  // item (stock hard-capped at 1 elsewhere), but applies to every product:
  // the "Sold" button reflects stock at page-load time, so a stale tab or a
  // typed-in quantity can't oversell past what's really available. This is
  // just a sensible starting point for `quantity` though -- the read above
  // can go stale between here and the write below (a concurrent Vendor Mode
  // tap, or a real online checkout landing on the same variant at the same
  // moment), which is exactly the race decrementStock's compare-and-swap
  // guards against, not this clamp.
  const quantity = Math.min(requestedQuantity, variant.stock);

  // Same compare-and-swap decrement checkout's placeOrder already uses (see
  // lib/stock.ts) -- reserve the stock first, atomically, instead of the
  // read-current-stock-then-write-a-new-absolute-value this replaces. That
  // older pattern could lose a concurrent decrement entirely (two
  // overlapping Sold taps both reading stock=1 and both succeeding), or
  // silently claw back a real online order's decrement if the two raced on
  // the same variant (this read-then-write here would overwrite whatever
  // the other transaction had already committed, rather than adjusting
  // relative to it).
  const decremented = await decrementStock(supabase, variantId, quantity);
  if (!decremented.ok) {
    return {
      ok: false,
      error:
        decremented.availableStock <= 0
          ? "Sorry, that item just sold out."
          : `Only ${decremented.availableStock} left -- try a smaller quantity.`,
    };
  }

  const { error: insertError } = await supabase.from("offline_sales").insert({
    artist_id: artistId,
    product_id: productId,
    variant_id: variantId,
    quantity,
    unit_price: variant.price,
    notes,
  });
  if (insertError) {
    console.error("Failed to record offline sale:", insertError);
    // Stock was already reserved by decrementStock above -- give it back
    // rather than leave it silently locked away with no sale to show for
    // it, same reasoning as placeOrder's own rollback-on-insert-failure.
    await restoreStock(supabase, variantId, quantity);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/vendor/mode");
  revalidatePath("/vendor");
  return { ok: true };
}
