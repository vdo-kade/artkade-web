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
