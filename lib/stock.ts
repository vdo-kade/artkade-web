import type { createAdminClient } from "./supabase-admin";

// Shared by app/checkout/actions.ts (reserving stock when an order is
// placed) and app/admin/orders/actions.ts (releasing it if that order gets
// rejected). Plain lib module rather than living in either "use server"
// actions file -- exporting a helper that takes a raw Supabase client as
// its first argument from a "use server" file would make it technically
// invokable as a Server Action in its own right if ever imported into a
// Client Component, which makes no sense for something whose first
// argument is a live client instance.

// Optimistic-concurrency decrement: reads the current stock, then writes
// with a WHERE stock = <value just read> guard. If another request
// decremented the same row in between, that guard matches zero rows and
// this retries against a fresh read instead of blindly overwriting --
// that's what actually stops two concurrent buyers of a stock=1 one-off
// from both succeeding, not just checking stock > 0 before writing.
export async function decrementStock(
  supabase: ReturnType<typeof createAdminClient>,
  variantId: string,
  quantity: number
): Promise<{ ok: true } | { ok: false; availableStock: number }> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current, error: readError } = await supabase
      .from("product_variants")
      .select("stock")
      .eq("id", variantId)
      .maybeSingle();
    if (readError || !current) return { ok: false, availableStock: 0 };
    if (current.stock < quantity) return { ok: false, availableStock: current.stock };

    const { data: updated, error: updateError } = await supabase
      .from("product_variants")
      .update({ stock: current.stock - quantity })
      .eq("id", variantId)
      .eq("stock", current.stock)
      .select("id");
    if (updateError) return { ok: false, availableStock: current.stock };
    if (updated && updated.length > 0) return { ok: true };
    // Row changed under us between the read and the write -- loop and
    // retry against a fresh read rather than risk a lost update.
  }
  return { ok: false, availableStock: -1 };
}

// Same compare-and-swap pattern, used to release a reservation: order
// creation failed after stock was already taken (see placeOrder), or an
// admin rejects an order that had reserved stock (see rejectOrder).
export async function restoreStock(
  supabase: ReturnType<typeof createAdminClient>,
  variantId: string,
  quantity: number
): Promise<void> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current } = await supabase.from("product_variants").select("stock").eq("id", variantId).maybeSingle();
    if (!current) return;
    const { data: updated } = await supabase
      .from("product_variants")
      .update({ stock: current.stock + quantity })
      .eq("id", variantId)
      .eq("stock", current.stock)
      .select("id");
    if (updated && updated.length > 0) return;
  }
  console.error(`Failed to restore ${quantity} unit(s) of stock for variant ${variantId} after ${MAX_ATTEMPTS} attempts.`);
}
