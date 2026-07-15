import type { createAdminClient } from "./supabase-admin";

type LifecycleResult = { activatedSlugs: string[]; archivedSlugs: string[] };

// The one function shared by the daily cron route, the God dashboard's
// manual "check now" button, and the automatic check that runs on every
// God dashboard page load. A pop-up's start/end dates are a real scheduled
// window, not just a countdown display -- this is what actually enforces
// it, by flipping artists.is_active (the same flag RLS already uses to hide
// inactive stalls from customers everywhere).
export async function runPopupLifecycleTick(
  supabase: ReturnType<typeof createAdminClient>,
  now: Date = new Date()
): Promise<LifecycleResult> {
  const nowIso = now.toISOString();

  // Activate: a scheduled pop-up whose start date has arrived and whose end
  // date (if any) hasn't passed yet.
  const { data: activated, error: activateError } = await supabase
    .from("artists")
    .update({ is_active: true })
    .eq("is_popup", true)
    .eq("is_active", false)
    .not("popup_starts_at", "is", null)
    .lte("popup_starts_at", nowIso)
    .or(`popup_ends_at.is.null,popup_ends_at.gt.${nowIso}`)
    .select("slug");
  if (activateError) console.error("Failed to activate due pop-ups:", activateError);

  // Archive: a live pop-up whose end date has passed.
  const { data: archived, error: archiveError } = await supabase
    .from("artists")
    .update({ is_active: false })
    .eq("is_popup", true)
    .eq("is_active", true)
    .not("popup_ends_at", "is", null)
    .lt("popup_ends_at", nowIso)
    .select("slug");
  if (archiveError) console.error("Failed to archive expired pop-ups:", archiveError);

  return {
    activatedSlugs: (activated ?? []).map((a) => a.slug),
    archivedSlugs: (archived ?? []).map((a) => a.slug),
  };
}
