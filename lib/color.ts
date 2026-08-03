// WCAG 2.1 relative luminance + contrast ratio -- standard formula
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance), used to guard a
// vendor's stall accent colour choice (see app/vendor/actions.ts's
// updateStallDetails) against picking something unreadable against the
// site's cream page background.

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return 0;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// The site's cream page background (tailwind.config.ts's `cream`) -- what
// a stall's accent colour actually renders against (StallCard's accent
// swatch, the stall page's own accent-tinted hero wash, "text-accent"
// links/badges throughout that stall's pages) in light mode.
export const CREAM_BACKGROUND = "#F5EFE4";

// The dark-mode page canvas (globals.css's `.dark` override for `cream`) --
// a straight reuse of the light-mode `ink` value, not a new colour (see
// that file's own comment). The accent swatch that isn't inside a
// light-surface card (currently just /freebies' stall bar) renders against
// this in dark mode, so a colour only validated against cream could read
// fine in light mode and disappear in dark mode.
export const DARK_BACKGROUND = "#1C1712";

// WCAG 2.1 SC 1.4.11 (non-text contrast) minimum for a meaningful graphical
// UI element against its background -- the accent swatch/links are exactly
// that, not a wall of body text, so this is the applicable threshold, not
// the stricter 4.5:1 normal-text minimum.
export const MIN_ACCENT_CONTRAST = 3;

// Checked against both page backgrounds, not just cream -- a colour that
// only clears the bar on one of them would go unreadable the moment the
// visitor (or the vendor previewing their own stall) switches theme. Note
// this makes the guard strictly stricter than before dark mode existed;
// see app/vendor/actions.ts's updateStallDetails for why an unchanged
// existing colour is grandfathered around this rather than validated fresh
// on every save.
export function isAccentColorReadable(hex: string): boolean {
  return (
    isValidHexColor(hex) &&
    contrastRatio(hex, CREAM_BACKGROUND) >= MIN_ACCENT_CONTRAST &&
    contrastRatio(hex, DARK_BACKGROUND) >= MIN_ACCENT_CONTRAST
  );
}
