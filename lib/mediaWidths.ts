// Single source of truth for the widths app/api/media/image/[id]/route.ts
// will actually resize to (its ALLOWED_WIDTHS) and the widths
// components/SelfHealingImage.tsx builds a srcset from -- imported by
// both rather than kept as two hand-synced literals, so they can't
// silently drift apart (a width the component requests that the route
// doesn't recognize just falls back to the full 1400px image, silently
// undoing the whole point of asking for a smaller one).
//
// Values cover this site's real rendered slots (see
// components/ExpandableImage.tsx, ProductDetail.tsx, RecentlyViewed.tsx,
// StickerWheel.tsx) at up to ~3x device pixel ratio: 96 for the ~32px
// corner-thumbnail/~96-104px avatar-ish slots, 200/320 for card grids on
// small viewports, 480/640 for card grids on larger ones and the
// product-detail image at typical widths, 960 for the same at high DPR,
// 1400 as the hard cap (also what a request with no width at all still
// gets).
export const RESPONSIVE_IMAGE_WIDTHS = [96, 200, 320, 480, 640, 960, 1400] as const;
