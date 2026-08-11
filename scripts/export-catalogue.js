#!/usr/bin/env node
// One-off catalogue export for pricing a hotel client's physical-artwork
// order. Self-contained (parses .env.local itself), same pattern as
// check-usage.js. Pulls every active AND inactive product/variant --
// this is a real-world sourcing document, not the storefront -- via the
// service-role key so RLS doesn't hide anything.

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

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mode(numbers) {
  const counts = new Map();
  for (const n of numbers) counts.set(n, (counts.get(n) || 0) + 1);
  let best = numbers[0];
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: artists, error: artistsError } = await supabase
    .from("artists")
    .select("id, name, slug")
    .order("sort_order", { ascending: true });
  if (artistsError) {
    console.error("Failed to fetch artists:", artistsError.message);
    process.exit(1);
  }

  const artistById = new Map(artists.map((a) => [a.id, a]));

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, artist_id, name, category, is_one_off, is_exclusive_drop, created_at, is_active"
    )
    .order("created_at", { ascending: true });
  if (productsError) {
    console.error("Failed to fetch products:", productsError.message);
    process.exit(1);
  }

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, label, price, stock, edition_size, is_active")
    .order("label", { ascending: true });
  if (variantsError) {
    console.error("Failed to fetch product_variants:", variantsError.message);
    process.exit(1);
  }

  const variantsByProduct = new Map();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push(v);
  }

  // ---- Build CSV rows: one row per variant (product rows with no
  // variants still get a single row so they aren't silently dropped) ----
  const rows = [];
  const header = [
    "stall_name",
    "product_name",
    "category",
    "variant_label",
    "price",
    "stock",
    "is_one_off",
    "edition_size",
    "is_exclusive_drop",
    "product_active",
    "variant_active",
    "created_at",
  ];
  rows.push(header);

  for (const p of products) {
    const artist = artistById.get(p.artist_id);
    const stallName = artist ? artist.name : "(unknown stall)";
    const pVariants = variantsByProduct.get(p.id) || [];

    if (pVariants.length === 0) {
      rows.push([
        stallName,
        p.name,
        p.category,
        "",
        "",
        "",
        p.is_one_off,
        "",
        p.is_exclusive_drop,
        p.is_active,
        "",
        p.created_at,
      ]);
      continue;
    }

    for (const v of pVariants) {
      rows.push([
        stallName,
        p.name,
        p.category,
        v.label,
        v.price,
        v.stock,
        p.is_one_off,
        v.edition_size ?? "",
        p.is_exclusive_drop,
        p.is_active,
        v.is_active,
        p.created_at,
      ]);
    }
  }

  const csvContent = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  const outPath = path.join(__dirname, "..", "..", "artkade_catalogue_export.csv");
  fs.writeFileSync(outPath, csvContent, "utf8");
  console.log(`Wrote ${rows.length - 1} variant rows to ${outPath}`);

  // ---- Summary: per stall, per size (variant label) ----
  // key = `${stallName}|||${label}`
  const groups = new Map();
  const productIdsSeenPerGroup = new Map(); // key -> Set(product_id) for distinct product count
  const oneOffOrLimitedPerGroup = new Map(); // key -> count

  for (const p of products) {
    const artist = artistById.get(p.artist_id);
    const stallName = artist ? artist.name : "(unknown stall)";
    const pVariants = variantsByProduct.get(p.id) || [];
    if (pVariants.length === 0) continue;

    for (const v of pVariants) {
      const key = `${stallName}|||${v.label}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(Number(v.price));

      if (!productIdsSeenPerGroup.has(key)) productIdsSeenPerGroup.set(key, new Set());
      productIdsSeenPerGroup.get(key).add(p.id);

      const isLimited = p.is_one_off || v.edition_size !== null;
      if (isLimited) {
        oneOffOrLimitedPerGroup.set(key, (oneOffOrLimitedPerGroup.get(key) || 0) + 1);
      }
    }
  }

  const summaryRows = [];
  for (const [key, prices] of groups) {
    const [stallName, label] = key.split("|||");
    summaryRows.push({
      stall: stallName,
      size: label,
      min: Math.min(...prices),
      max: Math.max(...prices),
      typical: mode(prices),
      median: median(prices),
      distinctProducts: productIdsSeenPerGroup.get(key).size,
      limitedCount: oneOffOrLimitedPerGroup.get(key) || 0,
    });
  }

  summaryRows.sort((a, b) => a.stall.localeCompare(b.stall) || a.size.localeCompare(b.size));

  const colWidths = { stall: 20, size: 34, min: 10, max: 10, typical: 10, products: 10, limited: 10 };
  const pad = (s, w) => String(s).padEnd(w);
  const ruleWidth =
    colWidths.stall + colWidths.size + colWidths.min + colWidths.max + colWidths.typical + colWidths.products + colWidths.limited;

  console.log("\n" + "=".repeat(ruleWidth));
  console.log("PER-STALL / PER-SIZE PRICING SUMMARY");
  console.log("=".repeat(ruleWidth));

  console.log(
    pad("Stall", colWidths.stall) +
      pad("Size", colWidths.size) +
      pad("Min", colWidths.min) +
      pad("Max", colWidths.max) +
      pad("Typical", colWidths.typical) +
      pad("#Products", colWidths.products) +
      pad("#1of1/Ltd", colWidths.limited)
  );
  console.log("-".repeat(ruleWidth));

  let currentStall = null;
  for (const r of summaryRows) {
    if (r.stall !== currentStall) {
      currentStall = r.stall;
      console.log("");
    }
    console.log(
      pad(r.stall, colWidths.stall) +
        pad(r.size, colWidths.size) +
        pad(`Rs. ${r.min}`, colWidths.min) +
        pad(`Rs. ${r.max}`, colWidths.max) +
        pad(`Rs. ${r.typical}`, colWidths.typical) +
        pad(r.distinctProducts, colWidths.products) +
        pad(r.limitedCount, colWidths.limited)
    );
  }
  console.log("\n" + "=".repeat(100));

  const totalProducts = products.length;
  const totalOneOffOrLimited = products.filter(
    (p) => p.is_one_off || (variantsByProduct.get(p.id) || []).some((v) => v.edition_size !== null)
  ).length;
  console.log(`TOTAL distinct products across all stalls: ${totalProducts}`);
  console.log(`TOTAL products flagged 1-of-1 or with a limited edition_size on any variant: ${totalOneOffOrLimited}`);
  console.log("=".repeat(100));
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
