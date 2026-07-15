"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";

// Admin-only lifecycle overrides for the God dashboard -- none of these are
// reachable from /vendor. Every action re-derives the caller's role from
// their session first, same house rule as every other action in this app.

export async function extendPopup(formData: FormData) {
  const session = await getSessionRole();
  if (session?.role !== "admin") return;

  const artistId = formData.get("artistId");
  const newPopupEndsAtRaw = formData.get("newPopupEndsAt");
  if (typeof artistId !== "string") return;
  if (typeof newPopupEndsAtRaw !== "string" || !newPopupEndsAtRaw) return;

  const supabase = createAdminClient();
  await supabase
    .from("artists")
    .update({ popup_ends_at: new Date(newPopupEndsAtRaw).toISOString(), is_active: true })
    .eq("id", artistId);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function convertToPermanent(formData: FormData) {
  const session = await getSessionRole();
  if (session?.role !== "admin") return;

  const artistId = formData.get("artistId");
  if (typeof artistId !== "string") return;

  const supabase = createAdminClient();
  // Dropping is_popup is what actually exempts this stall from
  // runPopupLifecycleTick going forward -- clearing the dates alone
  // wouldn't (there'd be nothing left to expire, but it'd also never be
  // eligible for the "already permanent" fast path anywhere else).
  await supabase
    .from("artists")
    .update({ is_popup: false, popup_starts_at: null, popup_ends_at: null, is_active: true })
    .eq("id", artistId);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function reactivateStall(formData: FormData) {
  const session = await getSessionRole();
  if (session?.role !== "admin") return;

  const artistId = formData.get("artistId");
  if (typeof artistId !== "string") return;

  const supabase = createAdminClient();
  await supabase.from("artists").update({ is_active: true }).eq("id", artistId);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function checkExpiryNow() {
  const session = await getSessionRole();
  if (session?.role !== "admin") return;

  await runPopupLifecycleTick(createAdminClient());

  revalidatePath("/admin");
  revalidatePath("/");
}
