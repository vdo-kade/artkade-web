// Vendors and admins sometimes paste text produced by "Instagram bio font"
// generators, which swap plain ASCII letters for lookalike Unicode
// codepoints from styled-alphabet blocks (e.g. Mathematical Alphanumeric
// Symbols, U+1D400-U+1D7FF -- U+1D5D7 MATHEMATICAL SANS-SERIF BOLD CAPITAL D
// instead of a plain "D"). Our serif display face has no glyphs for any of
// them, so every styled character renders as a tofu box on the live site
// (see Nuwan Shilpa's stall bio, 2026-09-01).
//
// Unicode NFKC (compatibility decomposition, then canonical composition) is
// the standard fix for MOST such blocks: a character with a Unicode
// *compatibility* decomposition (Mathematical Alphanumeric Symbols,
// fullwidth forms, the older Enclosed Alphanumerics circled letters, etc)
// folds back to its plain-ASCII equivalent under NFKC, while ordinary text
// is unaffected -- emoji and standard punctuation have no compatibility
// decomposition at all, and accented Latin (e.g. "é") normalizes to its
// already-standard composed form, not a stripped/ASCII one.
//
// It is NOT sufficient on its own, though -- confirmed against the actual
// scan of live data (scripts/normalize-existing-text.js) before this was
// written: Nuwan Shilpa's real bio used "negative circled/squared" capital
// letters from the newer Enclosed Alphanumeric Supplement block (U+1F150-
// U+1F169 and U+1F170-U+1F189, e.g. U+1F173 "🅳" for a styled "D") -- and
// the Unicode Character Database gives those codepoints NO decomposition
// mapping at all, unlike the older Enclosed Alphanumerics block (U+24B6
// "Ⓓ" etc, which NFKC already folds correctly). `"🅳".normalize("NFKC")`
// is a verified no-op. foldEnclosedAlphanumericLetters below closes that
// specific, real gap by direct codepoint arithmetic. It deliberately only
// covers the two pure-letter A-Z runs, not the neighbouring codepoints in
// the same block that are meaningful ready-made symbols rather than styled
// single letters (e.g. U+1F195 "🆕" NEW, U+1F197 "🆗" OK) -- folding those
// to a single letter would be wrong, not a fix.
//
// See scripts/text-normalize.test.mts for characterization checks of all
// of this (styled text folds, emoji/accents/punctuation don't change).
//
// Applied on save (server actions), not on render -- see app/vendor/
// actions.ts and app/admin/vendors/create/route.ts -- so it's caught once
// at the point of entry rather than needing every render path to remember
// to call it, and existing bad data still needs a one-time backfill (see
// scripts/normalize-existing-text.js).

const NEGATIVE_CIRCLED_CAPITAL_A = 0x1f150; // "🅐" NEGATIVE CIRCLED LATIN CAPITAL LETTER A
const NEGATIVE_CIRCLED_CAPITAL_Z = 0x1f169; // "🅩" NEGATIVE CIRCLED LATIN CAPITAL LETTER Z
const SQUARED_CAPITAL_A = 0x1f170; // "🅰" SQUARED LATIN CAPITAL LETTER A
const SQUARED_CAPITAL_Z = 0x1f189; // "🆉" NEGATIVE SQUARED LATIN CAPITAL LETTER Z

function foldEnclosedAlphanumericLetters(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp >= NEGATIVE_CIRCLED_CAPITAL_A && cp <= NEGATIVE_CIRCLED_CAPITAL_Z) {
      out += String.fromCharCode(65 + (cp - NEGATIVE_CIRCLED_CAPITAL_A));
    } else if (cp >= SQUARED_CAPITAL_A && cp <= SQUARED_CAPITAL_Z) {
      out += String.fromCharCode(65 + (cp - SQUARED_CAPITAL_A));
    } else {
      out += ch;
    }
  }
  return out;
}

export function normalizeStyledText(value: string): string {
  return foldEnclosedAlphanumericLetters(value).normalize("NFKC");
}

// Convenience wrapper for the very common "optional free-text field" shape
// used throughout app/vendor/actions.ts (tagline, bio, description): trims
// after normalizing (NFKC can turn a styled character that looked like
// whitespace into real whitespace, or vice versa, so trim has to run last),
// and collapses a blank result to null rather than an empty string, the
// same convention those call sites already followed before this helper
// existed.
export function normalizeStyledTextOrNull(value: string): string | null {
  const normalized = normalizeStyledText(value).trim();
  return normalized ? normalized : null;
}
