#!/usr/bin/env node
// One-off backfill for the "Instagram bio font" tofu-box bug (styled
// Unicode -- Mathematical Alphanumeric Symbols and similar compatibility
// blocks -- our serif face has no glyphs for, see lib/text-normalize.ts).
// Self-contained (parses .env.local itself), same pattern as
// check-usage.js / export-catalogue.js. Uses @supabase/supabase-js with the
// service-role key, never raw curl against the REST API.
//
// Two modes:
//   node scripts/normalize-existing-text.js scan   -- reports every row with
//     a character outside the "normal" range below, changes NOTHING.
//   node scripts/normalize-existing-text.js apply   -- re-runs the same scan,
//     then writes the NFKC-normalized text back to exactly the rows the
//     scan found (re-reads current values immediately before each write,
//     doesn't trust the scan's own snapshot, in case something else wrote
//     to the same row in between).
//
// "Normal" range, matched against every codepoint individually: Basic
// Latin, Latin-1 Supplement, Latin Extended-A/B (covers every accented
// Latin letter this site's vendors plausibly use), General Punctuation,
// currency symbols, and the emoji/symbol ranges most likely to appear in a
// bio -- explicitly NOT "the whole BMP", since that would also wave through
// e.g. Cyrillic/CJK look-alike homoglyph spoofing, which NFKC alone
// wouldn't fix anyway (it has no compatibility decomposition to Latin) --
// this scan's job is just to flag it for a human, not silently rewrite it.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function getClient() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Mirrors lib/text-normalize.ts's normalizeStyledText exactly, including
// its supplemental fold for the Enclosed Alphanumeric Supplement gap
// (see that file's comment -- plain NFKC alone is a verified no-op on
// those codepoints) -- NOT imported directly since this is a plain
// CommonJS script (see that file's own comment on why scripts/ duplicates
// small pieces of lib/*.ts logic rather than importing TS modules into a
// non-Next.js Node process).
const NEGATIVE_CIRCLED_CAPITAL_A = 0x1f150;
const NEGATIVE_CIRCLED_CAPITAL_Z = 0x1f169;
const SQUARED_CAPITAL_A = 0x1f170;
const SQUARED_CAPITAL_Z = 0x1f189;

function foldEnclosedAlphanumericLetters(value) {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0);
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

function normalizeStyledText(value) {
  return foldEnclosedAlphanumericLetters(value).normalize("NFKC");
}

// Emoji/symbol blocks a bio might reasonably contain -- deliberately
// allow-listed rather than "anything not Latin", so this scan stays a
// precise report of the actual bug (styled-alphabet tofu boxes) instead of
// flagging every legitimate emoji as suspicious.
const ALLOWED_RANGES = [
  [0x0009, 0x000a], // tab, newline
  [0x000d, 0x000d], // carriage return
  [0x0020, 0x007e], // Basic Latin (printable ASCII)
  [0x00a0, 0x024f], // Latin-1 Supplement + Latin Extended-A/B (accented Latin)
  [0x2000, 0x206f], // General Punctuation (em dash, curly quotes, ellipsis, etc)
  [0x20a0, 0x20cf], // Currency Symbols
  [0x2190, 0x21ff], // Arrows
  [0x2300, 0x23ff], // Misc Technical (incl. some emoji-adjacent symbols)
  [0x25a0, 0x25ff], // Geometric Shapes
  [0x2600, 0x27bf], // Misc Symbols + Dingbats (☀ ✨ ✔ etc)
  [0xfe0f, 0xfe0f], // variation selector-16 (emoji presentation)
  [0x1f300, 0x1faff], // Emoji blocks (Misc Symbols & Pictographs through Symbols & Pictographs Extended-A)
];

function isAllowedCodepoint(cp) {
  return ALLOWED_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

// Returns the distinct out-of-range codepoints found in `text`, or [] if
// none. Iterates by codepoint (for...of a string), not by UTF-16 code
// unit, so surrogate-pair astral characters (the Mathematical Alphanumeric
// Symbols block, emoji) are checked as one character each, not two bogus
// halves.
function findSuspiciousCodepoints(text) {
  if (typeof text !== "string" || !text) return [];
  const found = new Map();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (!isAllowedCodepoint(cp) && !found.has(cp)) found.set(cp, ch);
  }
  return Array.from(found.entries()).map(([cp, ch]) => ({ cp, ch }));
}

function describeCodepoint(cp) {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

const TARGET_FIELDS = {
  artists: ["name", "tagline", "bio"],
  products: ["name", "description"],
};

async function scanTable(supabase, table, fields) {
  const { data, error } = await supabase.from(table).select(`id, ${fields.join(", ")}`);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);

  const hits = [];
  for (const row of data ?? []) {
    for (const field of fields) {
      const value = row[field];
      const suspicious = findSuspiciousCodepoints(value);
      if (suspicious.length) hits.push({ table, id: row.id, field, value, suspicious });
    }
  }
  return hits;
}

async function scan(supabase) {
  const allHits = [];
  for (const [table, fields] of Object.entries(TARGET_FIELDS)) {
    allHits.push(...(await scanTable(supabase, table, fields)));
  }

  if (allHits.length === 0) {
    console.log("Scan complete: no rows with out-of-range characters found.");
    return allHits;
  }

  console.log(`Scan complete: ${allHits.length} field(s) with out-of-range characters found.\n`);
  for (const hit of allHits) {
    const codepointList = hit.suspicious.map((s) => `${describeCodepoint(s.cp)} (${JSON.stringify(s.ch)})`).join(", ");
    console.log(`[${hit.table}.${hit.field}] id=${hit.id}`);
    console.log(`  current value: ${JSON.stringify(hit.value)}`);
    console.log(`  suspicious codepoints: ${codepointList}`);
    console.log(`  after NFKC:    ${JSON.stringify(normalizeStyledText(hit.value))}`);
    console.log("");
  }
  return allHits;
}

async function apply(supabase) {
  const hits = await scan(supabase);
  if (hits.length === 0) return;

  console.log(`Applying NFKC normalization to ${hits.length} field(s)...\n`);
  let updated = 0;
  for (const hit of hits) {
    // Re-read the current value immediately before writing, rather than
    // trusting the scan snapshot above -- this is a one-off backfill
    // script, not a transaction, and shouldn't clobber a real edit that
    // happened to land between scan and apply.
    const { data: current, error: readError } = await supabase
      .from(hit.table)
      .select(hit.field)
      .eq("id", hit.id)
      .maybeSingle();
    if (readError || !current) {
      console.warn(`  SKIP [${hit.table}.${hit.field}] id=${hit.id}: failed to re-read row (${readError?.message ?? "not found"})`);
      continue;
    }
    const liveValue = current[hit.field];
    if (typeof liveValue !== "string" || findSuspiciousCodepoints(liveValue).length === 0) {
      console.log(`  SKIP [${hit.table}.${hit.field}] id=${hit.id}: no longer has out-of-range characters (already fixed?)`);
      continue;
    }
    const normalized = normalizeStyledText(liveValue);
    const { error: writeError } = await supabase.from(hit.table).update({ [hit.field]: normalized }).eq("id", hit.id);
    if (writeError) {
      console.error(`  FAILED [${hit.table}.${hit.field}] id=${hit.id}: ${writeError.message}`);
      continue;
    }
    console.log(`  OK [${hit.table}.${hit.field}] id=${hit.id}`);
    updated++;
  }
  console.log(`\nDone. ${updated}/${hits.length} field(s) updated.`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "scan" && mode !== "apply") {
    console.error("Usage: node scripts/normalize-existing-text.js <scan|apply>");
    process.exit(1);
  }
  const supabase = getClient();
  if (mode === "scan") await scan(supabase);
  else await apply(supabase);
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
