// Characterization checks for lib/text-normalize.ts -- proves the NFKC
// helper folds "Instagram bio font" styled Unicode back to plain ASCII
// while leaving emoji, accented Latin, and ordinary punctuation untouched.
//
// Uses Node's built-in test runner (node:test, no new dependency -- this
// project has no test framework installed) against the *real* module, not
// a copy: imported straight from lib/text-normalize.ts via Node 22+'s
// native TypeScript support. Explicit .mts extension so Node always treats
// this file as ESM regardless of package.json's (absent, so default
// CommonJS) "type" field -- every other script in this repo is deliberately
// plain CommonJS (see scripts/check-usage.js etc.), so that field is left
// alone rather than flipped globally.
//
// Run: node --test scripts/text-normalize.test.mts  (or: npm run test:text-normalize)

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStyledText, normalizeStyledTextOrNull } from "../lib/text-normalize.ts";

// Builds a Mathematical Alphanumeric Symbols "Sans-Serif Bold" string for
// any A-Z/a-z input -- the exact style Instagram bio-font generators
// produce, and the one from the actual bug report (U+1D5D7 = Sans-Serif
// Bold Capital D). Generated from the block's known offsets rather than
// pasted as literal glyphs in this file, so the mapping is auditable instead
// of relying on invisible-in-a-diff exotic codepoints.
const SANS_BOLD_UPPER_A = 0x1d5d4; // MATHEMATICAL SANS-SERIF BOLD CAPITAL A
const SANS_BOLD_LOWER_A = 0x1d5ee; // MATHEMATICAL SANS-SERIF BOLD SMALL A
function toStyled(ascii: string): string {
  return Array.from(ascii)
    .map((ch) => {
      if (ch >= "A" && ch <= "Z") return String.fromCodePoint(SANS_BOLD_UPPER_A + (ch.charCodeAt(0) - 65));
      if (ch >= "a" && ch <= "z") return String.fromCodePoint(SANS_BOLD_LOWER_A + (ch.charCodeAt(0) - 97));
      return ch; // spaces/punctuation pass through unstyled, same as a real generator
    })
    .join("");
}

test("folds Mathematical Sans-Serif Bold letters back to plain ASCII", () => {
  const styled = toStyled("Nuwan Shilpa");
  assert.notEqual(styled, "Nuwan Shilpa", "test setup sanity: styled text must actually differ from plain ASCII");
  assert.equal(normalizeStyledText(styled), "Nuwan Shilpa");
});

test("the exact codepoint from the bug report (U+1D5D7) folds to 'D'", () => {
  const d = String.fromCodePoint(0x1d5d7); // MATHEMATICAL SANS-SERIF BOLD CAPITAL D
  assert.equal(normalizeStyledText(d), "D");
});

test("folds the real production bug: negative squared/circled letters (no Unicode decomposition, NFKC alone is a no-op)", () => {
  // The actual live bio text found by scripts/normalize-existing-text.js's
  // scan: "🅳igital 🅼ind 🆃rips ... 🅻atent 🆂piritual 🅳imensions" ==
  // "Digital Mind Trips ... Latent Spiritual Dimensions", styled with
  // NEGATIVE SQUARED capital letters (U+1F170-U+1F189). Plain
  // `.normalize("NFKC")` verified to leave these completely unchanged --
  // this is exactly the gap foldEnclosedAlphanumericLetters exists for.
  const D = String.fromCodePoint(0x1f173); // 🅳 NEGATIVE SQUARED LATIN CAPITAL LETTER D
  const M = String.fromCodePoint(0x1f17c); // 🅼
  const T = String.fromCodePoint(0x1f183); // 🆃
  const styledBio = `I create ${D}igital ${M}ind ${T}rips inspired by latent spiritual dimensions.`;
  assert.equal(styledBio.normalize("NFKC"), styledBio, "sanity: plain NFKC alone must be a no-op on this block");
  assert.equal(normalizeStyledText(styledBio), "I create Digital Mind Trips inspired by latent spiritual dimensions.");
});

test("does not mangle meaningful ready-made symbols from the same block (not styled single letters)", () => {
  const ok = String.fromCodePoint(0x1f197); // 🆗 SQUARED OK
  const newSym = String.fromCodePoint(0x1f195); // 🆕 SQUARED NEW
  assert.equal(normalizeStyledText(`Back in stock ${ok} check the ${newSym} drop`), `Back in stock ${ok} check the ${newSym} drop`);
});

test("folds a second styled alphabet (fullwidth) too, not just one block", () => {
  // Fullwidth Latin Capital Letter A is U+FF21 ("Ａ") -- a different styled-
  // alphabet block than Mathematical Alphanumeric Symbols, also produced by
  // some "fancy text" generators, also NFKC-foldable.
  const fullwidth = "ＡＲＴ".toString(); // "ART" in fullwidth
  assert.notEqual(fullwidth, "ART");
  assert.equal(normalizeStyledText(fullwidth), "ART");
});

test("leaves emoji untouched", () => {
  const withEmoji = "New drop \u{1F3A8}\u{1F58C}\u{FE0F}✨ this weekend!"; // 🎨🖌️✨
  assert.equal(normalizeStyledText(withEmoji), withEmoji);
});

test("leaves accented Latin characters untouched (same rendered text)", () => {
  const accented = "Café in México — © Art Kade"; // "Café in México — © Art Kade"
  assert.equal(normalizeStyledText(accented), accented);
});

test("a decomposed accent (combining acute) recomposes to the same standard form, not stripped", () => {
  const decomposed = "Café"; // "Cafe" + COMBINING ACUTE ACCENT
  assert.equal(normalizeStyledText(decomposed), "Café"); // precomposed "café", accent kept
});

test("leaves ordinary punctuation and digits untouched", () => {
  const plain = 'Hello, World! 100% cotton -- "quoted" & <ok> #1.';
  assert.equal(normalizeStyledText(plain), plain);
});

test("is idempotent (normalizing already-plain or already-normalized text is a no-op)", () => {
  const once = normalizeStyledText(toStyled("Founders Tee"));
  assert.equal(normalizeStyledText(once), once);
});

test("normalizeStyledTextOrNull trims and collapses a blank styled string to null", () => {
  assert.equal(normalizeStyledTextOrNull("   "), null);
  assert.equal(normalizeStyledTextOrNull(`  ${toStyled("Bio")}  `), "Bio");
});
