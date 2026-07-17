// Shared between Header.tsx (small header mark) and the homepage hero
// (large brand moment) so both point at the same Supabase Storage assets.
export const LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20on%20trans.png";

// The short "AX" mark (same asset used for the favicon) -- used in the
// header now that the logo sits directly on cream instead of an ink plate.
export const SHORT_LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20Short%20on%20trans.png";

// Both logo assets' neutral element (the triangle-eye mark / "ART"
// wordmark) is pure white -- ~1.1:1 contrast against this site's cream
// (#F5EFE4), effectively invisible on its own (confirmed via computed-style
// check). Since the artwork stays transparent (no solid backing plate), the
// white shape's only source of definition against cream is a hard-edged
// outline built from several 0-blur drop-shadows stacked in a ring around
// the silhouette (not a single soft/ambient one, which doesn't create a
// legible edge) plus one larger soft shadow underneath for depth. `ink`
// (#1C1712) is the same dark token used for this site's default body text
// on cream, i.e. an already-proven-legible pairing.
//
// The stroke offset needs to scale with the logo's own rendered size --
// 1px reads as a crisp thin outline on the header's small mark but is
// barely perceptible at the hero's much larger scale, so the hero gets a
// proportionally heavier stroke rather than reusing the header's filter.
export const LOGO_OUTLINE_FILTER_SMALL = [
  "drop-shadow(1px 0 0 rgba(28,23,18,0.9))",
  "drop-shadow(-1px 0 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 -1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(1px 1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(-1px -1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(1px -1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(-1px 1px 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 6px 10px rgba(28,23,18,0.35))",
].join(" ");

export const LOGO_OUTLINE_FILTER_LARGE = [
  "drop-shadow(2.5px 0 0 rgba(28,23,18,0.9))",
  "drop-shadow(-2.5px 0 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 -2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(2.5px 2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(-2.5px -2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(2.5px -2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(-2.5px 2.5px 0 rgba(28,23,18,0.9))",
  "drop-shadow(0 14px 26px rgba(28,23,18,0.4))",
].join(" ");
