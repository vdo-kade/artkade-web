export type SocialLink = { label: string; url: string };

// Matches SocialIcon.tsx's own label-matching logic -- kept in the same
// rank order so "which icon renders" and "where it sits in the row" never
// disagree about what a label means.
const PLATFORM_RANK: { test: (norm: string) => boolean }[] = [
  { test: (n) => n.includes("instagram") },
  { test: (n) => n.includes("tiktok") },
  { test: (n) => n === "x" || n.includes("twitter") },
  { test: (n) => n.includes("facebook") },
  { test: (n) => n.includes("youtube") },
];

function rankFor(label: string): number {
  const norm = label.trim().toLowerCase();
  const index = PLATFORM_RANK.findIndex((p) => p.test(norm));
  return index === -1 ? PLATFORM_RANK.length : index;
}

// artists.socials is a vendor-editable jsonb array (see app/vendor/actions.ts's
// updateStallDetails) -- its stored order is just whatever order the vendor
// happened to type rows in, which is why two stalls that both link
// Instagram+TikTok could render them in a different order from each other.
// The footer (and anywhere else socials render) sorts through this instead
// of trusting array order directly: known platforms in a fixed order,
// then anything else (a personal "Website" link, etc) alphabetically by
// label, so the result is fully deterministic regardless of storage order.
export function sortSocialsForDisplay(socials: SocialLink[]): SocialLink[] {
  return [...socials].sort((a, b) => {
    const ra = rankFor(a.label);
    const rb = rankFor(b.label);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}
