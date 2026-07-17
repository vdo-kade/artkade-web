"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";
import type { ActionState } from "@/lib/action-state";

// Admin-only lifecycle overrides for the God dashboard -- none of these are
// reachable from /vendor. Every action re-derives the caller's role from
// their session first, same house rule as every other action in this app.

export async function extendPopup(formData: FormData): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const artistId = formData.get("artistId");
  const newPopupEndsAtRaw = formData.get("newPopupEndsAt");
  if (typeof artistId !== "string") return { ok: false, error: "Missing stall." };
  if (typeof newPopupEndsAtRaw !== "string" || !newPopupEndsAtRaw) {
    return { ok: false, error: "Choose a new end date." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("artists")
    .update({ popup_ends_at: new Date(newPopupEndsAtRaw).toISOString(), is_active: true })
    .eq("id", artistId);
  if (error) {
    console.error("Failed to extend popup:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function convertToPermanent(formData: FormData): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const artistId = formData.get("artistId");
  if (typeof artistId !== "string") return { ok: false, error: "Missing stall." };

  const supabase = createAdminClient();
  // Dropping is_popup is what actually exempts this stall from
  // runPopupLifecycleTick going forward -- clearing the dates alone
  // wouldn't (there'd be nothing left to expire, but it'd also never be
  // eligible for the "already permanent" fast path anywhere else).
  const { error } = await supabase
    .from("artists")
    .update({ is_popup: false, popup_starts_at: null, popup_ends_at: null, is_active: true })
    .eq("id", artistId);
  if (error) {
    console.error("Failed to convert stall to permanent:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function reactivateStall(formData: FormData): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const artistId = formData.get("artistId");
  if (typeof artistId !== "string") return { ok: false, error: "Missing stall." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("artists").update({ is_active: true }).eq("id", artistId);
  if (error) {
    console.error("Failed to reactivate stall:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteVendor(formData: FormData): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const artistId = formData.get("artistId");
  if (typeof artistId !== "string") return { ok: false, error: "Missing stall." };

  const supabase = createAdminClient();

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .maybeSingle();
  if (artistError) {
    console.error("Failed to load vendor for delete:", artistError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  if (!artist) return { ok: false, error: "Stall not found." };

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("artist_id", artistId);
  if (productsError) {
    console.error("Failed to load products for vendor delete:", productsError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  const productIds = (products ?? []).map((p) => p.id);

  // order_items.product_id has no ON DELETE cascade/set-null (deliberately
  // -- customer orders should never silently lose their line items), so a
  // vendor with real order history can't be hard-deleted without either
  // corrupting past orders or leaving the delete half-applied. Block it and
  // point the admin at deactivation instead, rather than doing either.
  if (productIds.length > 0) {
    const { count: orderItemCount, error: orderItemsError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("product_id", productIds);
    if (orderItemsError) {
      console.error("Failed to check order history for vendor delete:", orderItemsError);
      return { ok: false, error: "Something went wrong. Check server logs." };
    }
    if ((orderItemCount ?? 0) > 0) {
      return {
        ok: false,
        error: `"${artist.name}" has ${orderItemCount} order item${orderItemCount === 1 ? "" : "s"} tied to their products. Deleting would corrupt real order history -- deactivate the stall instead (toggle it inactive) rather than deleting it.`,
      };
    }
  }

  // offline_sales does cascade at the DB level, but that would silently
  // erase logged in-person sales history -- same call as order_items above,
  // just enforced here instead of relying on the FK to block it.
  const { count: offlineSalesCount, error: offlineSalesError } = await supabase
    .from("offline_sales")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId);
  if (offlineSalesError) {
    console.error("Failed to check offline sales for vendor delete:", offlineSalesError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  if ((offlineSalesCount ?? 0) > 0) {
    return {
      ok: false,
      error: `"${artist.name}" has ${offlineSalesCount} logged offline sale${offlineSalesCount === 1 ? "" : "s"}. Deleting would erase that history -- deactivate the stall instead of deleting it.`,
    };
  }

  // magazine_posts.artist_id is a plain nullable FK with no cascade -- a
  // post should outlive its author leaving, so detach authorship rather
  // than blocking the delete over it (and rather than letting the FK
  // reject the artist delete outright).
  const { error: magazineError } = await supabase
    .from("magazine_posts")
    .update({ artist_id: null })
    .eq("artist_id", artistId);
  if (magazineError) {
    console.error("Failed to detach magazine posts for vendor delete:", magazineError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Vendor logins are plain Supabase Auth users with no profiles table --
  // the artist_id lives only in that user's app_metadata (see
  // lib/session-role.ts) -- so finding "this vendor's login" means scanning
  // auth users for a matching app_metadata.artist_id rather than a join.
  // Deleted first, and treated as fatal if it fails, so a hard-deleted
  // vendor can never end up with a still-working login pointing at a
  // now-gone artist_id.
  const { data: usersPage, error: listUsersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listUsersError) {
    console.error("Failed to list auth users for vendor delete:", listUsersError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  const matchingUsers = usersPage.users.filter((u) => u.app_metadata?.artist_id === artistId);
  for (const user of matchingUsers) {
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error("Failed to delete vendor auth user:", deleteUserError);
      return { ok: false, error: "Something went wrong. Check server logs." };
    }
  }

  // products/product_variants/offline_sales/stall_collaborators all cascade
  // from artists via FK (and offline_sales/order_items were already
  // confirmed empty above), so deleting the artist row is enough.
  const { error: deleteError } = await supabase.from("artists").delete().eq("id", artistId);
  if (deleteError) {
    console.error("Failed to delete vendor:", deleteError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function checkExpiryNow(): Promise<ActionState> {
  // See app/admin/magazine/actions.ts for why this redirects instead of
  // silently no-opping: a dead session should bounce to login, not look
  // like a broken button.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  await runPopupLifecycleTick(createAdminClient());

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}
