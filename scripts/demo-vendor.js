#!/usr/bin/env node
// Creates (or tears down) a disposable demo vendor stall -- "Demo Kade" --
// for pitch-deck screenshots. Self-contained (parses .env.local itself),
// same pattern as check-usage.js / export-catalogue.js. Uses the
// service-role key directly, bypassing RLS and every app Server Action, on
// purpose: this seeds synthetic historical data (past order timestamps,
// backdated status history) that the real app flows have no path to
// produce, and skips side effects (emails, rate limits) that don't apply
// to fake data.
//
// Usage:
//   node scripts/demo-vendor.js create   -- creates the stall, catalogue, and trading history
//   node scripts/demo-vendor.js delete   -- deletes the whole demo stall and everything attached to it
//
// The stall is inactive (artists.is_active = false), so it never appears
// on the public site (supabase/schema.sql's "public can read active
// artists" RLS policy blocks it entirely) -- only reachable by logging
// into /admin/login with the vendor credentials this script prints.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const DEMO_SLUG = "demo-kade";
const DEMO_NAME = "Demo Kade";
const DEMO_EMAIL = "demo-vendor@artkade.space";
const BUCKET = "media";
const IS_DEMO_MIGRATION_SQL = "supabase/2026-08-31-add-is-demo-flag.sql";

// ---------- env / client ----------

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

// ---------- small shared helpers (mirrors lib/*.ts logic, duplicated here
// since this is a plain Node script and those are TS modules under a
// path-aliased Next.js app) ----------

function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

// Same word-word-####! shape as lib/gen-password.ts's genTempPassword.
const PASSWORD_WORDS = "kade-stall-print-drop-inkwell-collab-atelier".split("-");
function genPassword() {
  const pick = () => PASSWORD_WORDS[crypto.randomInt(PASSWORD_WORDS.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 9999)}!`;
}

// Mirrors lib/shipping.ts's defaultWeightGrams.
function defaultWeightGrams(category, label) {
  if (category === "sticker_pack") return 5;
  if (category === "tshirt") return 200;
  if (category === "print") {
    const l = label.toUpperCase();
    if (/\bA6\b/.test(l) || /\bA5\b/.test(l)) return 15;
    if (/\bA4\b/.test(l)) return 40;
    if (/\bA3\b/.test(l)) return 80;
    return null;
  }
  return null;
}

// Mirrors lib/shipping.ts's determineShippingMethod/isRegisteredPostEligibleItem.
function isRegisteredPostEligibleItem(item) {
  if (item.category === "sticker_pack") return true;
  if (item.category === "print") {
    const l = item.label.toUpperCase();
    if (/\bA3\b/.test(l) || /\bA2\b/.test(l) || /\bA1\b/.test(l)) return false;
    return true;
  }
  return false; // tshirt/other
}
function determineShippingMethod(items, totalWeightGrams) {
  if (totalWeightGrams > 1000) return "courier";
  return items.every(isRegisteredPostEligibleItem) ? "registered_post" : "courier";
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// ---------- placeholder art ----------
// Generated in-process (SVG -> PNG via sharp, already a project dependency
// -- see app/api/media/image/[id]/route.ts) rather than fetched from any
// external placeholder service: no network dependency, and the watermark
// text below makes it unmistakable that this is not real artwork, per the
// "clearly generic, not anyone's real artwork" requirement.
const CATEGORY_META = {
  sticker_pack: { label: "Sticker", color: "#FFF1D6" },
  print: { label: "Print", color: "#E3F0FF" },
  tshirt: { label: "T-Shirt", color: "#E6F7E9" },
};

function placeholderSvg(title, category) {
  const meta = CATEGORY_META[category];
  const watermarkRows = Array.from({ length: 6 })
    .map(
      (_, i) =>
        `<text x="-150" y="${100 + i * 170}" font-family="sans-serif" font-size="80" font-weight="700" fill="#000">PLACEHOLDER PLACEHOLDER PLACEHOLDER</text>`
    )
    .join("");
  return `<svg width="1000" height="1000" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="1000" fill="${meta.color}"/>
    <g opacity="0.12" transform="rotate(-20 500 500)">${watermarkRows}</g>
    <rect x="50" y="50" width="900" height="900" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="16 10" opacity="0.35"/>
    <text x="500" y="450" font-family="sans-serif" font-size="52" font-weight="700" text-anchor="middle" fill="#111">${escapeXml(title)}</text>
    <text x="500" y="510" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#333">${meta.label} - placeholder image</text>
    <text x="500" y="945" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#555">Art Kade - DEMO STALL - not real artwork</text>
  </svg>`;
}

async function uploadPlaceholderImage(supabase, productSlug, title, category) {
  const svg = placeholderSvg(title, category);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const objectPath = `products/${DEMO_SLUG}/${productSlug}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Failed to upload placeholder image for "${title}": ${error.message}`);
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}

// ---------- catalogue plan ----------
// 12 products across the three physical categories, standard price grid,
// varied stock including one near-sold-out and one true 1-of-1.
const PRODUCT_PLAN = [
  // ---- sticker_pack: Small 200 / Medium 300 / Large 600 ----
  { category: "sticker_pack", name: "Moonlit Cat", description: "Vinyl sticker, matte weatherproof finish.",
    variants: [{ label: "Small", price: 200, stock: 40 }, { label: "Medium", price: 300, stock: 30 }, { label: "Large", price: 600, stock: 15 }] },
  { category: "sticker_pack", name: "Retro Sunset Wave", description: "Vinyl sticker, glossy finish.",
    variants: [{ label: "Small", price: 200, stock: 35 }, { label: "Medium", price: 300, stock: 22 }, { label: "Large", price: 600, stock: 10 }] },
  { category: "sticker_pack", name: "Tiny Dino", description: "Vinyl sticker, matte weatherproof finish.", isBestseller: true,
    variants: [{ label: "Small", price: 200, stock: 50 }, { label: "Medium", price: 300, stock: 40 }, { label: "Large", price: 600, stock: 20 }] },
  { category: "sticker_pack", name: "Cloud Nine", description: "Vinyl sticker, glossy finish.", // nearly sold out
    variants: [{ label: "Small", price: 200, stock: 2 }, { label: "Medium", price: 300, stock: 1 }, { label: "Large", price: 600, stock: 0 }] },
  { category: "sticker_pack", name: "Star Trail", description: "Vinyl sticker, matte weatherproof finish.",
    variants: [{ label: "Small", price: 200, stock: 28 }, { label: "Medium", price: 300, stock: 18 }, { label: "Large", price: 600, stock: 9 }] },

  // ---- print: A6 1000 / A5 1500 / A3 5000 ----
  { category: "print", name: "Forest Spirit", description: "Giclee print on 250gsm matte card.",
    variants: [{ label: "A6", price: 1000, stock: 25 }, { label: "A5", price: 1500, stock: 15 }, { label: "A3", price: 5000, stock: 6 }] },
  { category: "print", name: "City Lights", description: "Giclee print on 250gsm matte card.",
    variants: [{ label: "A6", price: 1000, stock: 20 }, { label: "A5", price: 1500, stock: 12 }, { label: "A3", price: 5000, stock: 5 }] },
  { category: "print", name: "Ocean Dream", description: "Giclee print on 250gsm matte card.", isBestseller: true,
    variants: [{ label: "A6", price: 1000, stock: 30 }, { label: "A5", price: 1500, stock: 20 }, { label: "A3", price: 5000, stock: 8 }] },
  { category: "print", name: "Golden Hour - Artist Proof", description: "Hand-numbered artist proof, single edition -- once it's gone, it's gone.",
    isOneOff: true, variants: [{ label: "A3, artist proof", price: 5000, stock: 1 }] }, // 1-of-1

  // ---- tshirt: flat 5000, shared stock pool across sizes ----
  { category: "tshirt", name: "Basic Logo Tee", description: "100% cotton, screen-printed front logo.",
    poolStock: 24, sizes: ["S", "M", "L", "XL"] },
  { category: "tshirt", name: "Weekend Tee", description: "100% cotton, screen-printed graphic tee.",
    poolStock: 16, sizes: ["S", "M", "L", "XL"] },
  { category: "tshirt", name: "Founders Tee", description: "100% cotton, screen-printed graphic tee.",
    poolStock: 8, sizes: ["S", "M", "L", "XL"] },
];

// ---------- fake customer data (clearly fictional -- example.com is IANA-
// reserved for documentation and never deliverable; every name/address is
// tagged "(test)" so nobody mistakes this for a real customer record) ----------
const FAKE_CUSTOMERS = [
  { name: "Nimal Perera (test)", email: "demo.customer1@example.com", phone: "+94 70 000 0001", address: "12 Placeholder Lane, Colombo 05, Sri Lanka (test address)" },
  { name: "Amara Silva (test)", email: "demo.customer2@example.com", phone: "+94 70 000 0002", address: "45 Sample Road, Kandy, Sri Lanka (test address)" },
  { name: "Kasun Fernando (test)", email: "demo.customer3@example.com", phone: "+94 70 000 0003", address: "8 Fictional Street, Galle, Sri Lanka (test address)" },
  { name: "Dilani Jayasuriya (test)", email: "demo.customer4@example.com", phone: "+94 70 000 0004", address: "231 Example Avenue, Negombo, Sri Lanka (test address)" },
  { name: "Ruwan Bandara (test)", email: "demo.customer5@example.com", phone: "+94 70 000 0005", address: "5 Test Gardens, Kurunegala, Sri Lanka (test address)" },
  { name: "Chamari Wickrama (test)", email: "demo.customer6@example.com", phone: "+94 70 000 0006", address: "67 Placeholder Place, Jaffna, Sri Lanka (test address)" },
  { name: "Sanduni Rathnayake (test)", email: "demo.customer7@example.com", phone: "+94 70 000 0007", address: "19 Sample Terrace, Matara, Sri Lanka (test address)" },
  { name: "Tharindu Gunasekara (test)", email: "demo.customer8@example.com", phone: "+94 70 000 0008", address: "3 Fictional Close, Ratnapura, Sri Lanka (test address)" },
  { name: "Ishara Herath (test)", email: "demo.customer9@example.com", phone: "+94 70 000 0009", address: "88 Example Court, Anuradhapura, Sri Lanka (test address)" },
  { name: "Malith Kodithuwakku (test)", email: "demo.customer10@example.com", phone: "+94 70 000 0010", address: "14 Test Row, Batticaloa, Sri Lanka (test address)" },
];

function randomCustomer() {
  return FAKE_CUSTOMERS[crypto.randomInt(FAKE_CUSTOMERS.length)];
}

// ---------- order plan: ~8 weeks, funnel-shaped so older weeks have
// mostly resolved (delivered) orders and the current week is mostly still
// pending -- believable trading history, not random noise. ----------
const WEEK_PLAN = [
  { weeksAgo: 0, statuses: ["awaiting_review", "awaiting_review", "awaiting_review", "approved"] },
  { weeksAgo: 1, statuses: ["awaiting_review", "awaiting_review", "approved"] },
  { weeksAgo: 2, statuses: ["approved", "shipped", "shipped"] },
  { weeksAgo: 3, statuses: ["shipped", "shipped", "delivered"] },
  { weeksAgo: 4, statuses: ["shipped", "delivered", "delivered"] },
  { weeksAgo: 5, statuses: ["delivered", "delivered", "delivered"] },
  { weeksAgo: 6, statuses: ["delivered", "delivered", "delivered"] },
  { weeksAgo: 7, statuses: ["delivered", "delivered", "delivered", "delivered"] },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function addHours(date, h) {
  return new Date(date.getTime() + h * 60 * 60 * 1000);
}
function generateOrderNumber() {
  // Reserved high block (800000-899999) so seeded demo orders can never
  // collide with real sequential order numbers -- still checked for a
  // genuine unique-constraint conflict on insert (see insertOrder below)
  // rather than trusted blindly.
  const n = crypto.randomInt(800000, 900000);
  return `ARTK-${n}`;
}

// ---------- column-existence tolerant is_demo handling ----------
// This script can create the full stall/catalogue/history right now even
// if supabase/2026-08-31-add-is-demo-flag.sql hasn't been run yet -- only
// the is_demo flag itself degrades gracefully, since it's purely a
// reporting-exclusion aid (see schema.sql's comment on the column), not a
// visibility control (artists.is_active already fully hides this stall
// from the public site regardless of is_demo).
async function insertArtistTolerant(supabase, baseRow) {
  const withFlag = await supabase.from("artists").insert({ ...baseRow, is_demo: true }).select("id, slug").single();
  if (!withFlag.error) return { artist: withFlag.data, isDemoFlagApplied: true };
  if (withFlag.error.code !== "42703" && !/is_demo/.test(withFlag.error.message || "")) {
    throw new Error(`Failed to create artist: ${withFlag.error.message}`);
  }
  const noFlag = await supabase.from("artists").insert(baseRow).select("id, slug").single();
  if (noFlag.error) throw new Error(`Failed to create artist: ${noFlag.error.message}`);
  return { artist: noFlag.data, isDemoFlagApplied: false };
}

// ---------- CREATE ----------

async function create() {
  const supabase = getClient();

  const { data: existing } = await supabase.from("artists").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  if (existing) {
    console.error(
      `A stall with slug "${DEMO_SLUG}" already exists (id ${existing.id}). Run "node scripts/demo-vendor.js delete" first, then re-run create.`
    );
    process.exit(1);
  }

  console.log(`Creating "${DEMO_NAME}"...`);

  const { artist, isDemoFlagApplied } = await insertArtistTolerant(supabase, {
    slug: DEMO_SLUG,
    name: DEMO_NAME,
    tagline: "Sample stall for demos and screenshots only.",
    bio: "This is a disposable demo stall used to generate screenshots for the Art Kade pitch deck. Every product, price, and order here is a placeholder -- nothing here is a real sale.",
    is_active: false, // never appears on the public site (RLS-gated)
    is_popup: false,
    sort_order: 9999,
  });
  if (!isDemoFlagApplied) {
    console.warn(
      `\nWARNING: artists.is_demo column doesn't exist yet, so this stall was created WITHOUT the demo flag.\n` +
        `Run ${IS_DEMO_MIGRATION_SQL} in the Supabase SQL editor, then run:\n` +
        `  update artists set is_demo = true where slug = '${DEMO_SLUG}';\n` +
        `to flag it retroactively (or just re-run this create script from scratch after adding the column).\n`
    );
  }

  // ---- products, variants, images ----
  const variantPool = []; // { variantId, productId, category, label, price }
  const productIds = [];
  let totalStockUnits = 0;

  for (const plan of PRODUCT_PLAN) {
    const productSlug = `${DEMO_SLUG}-${slugify(plan.name)}`;
    const imageUrl = await uploadPlaceholderImage(supabase, productSlug, plan.name, plan.category);

    const isTshirt = plan.category === "tshirt";
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        artist_id: artist.id,
        category: plan.category,
        name: plan.name,
        slug: productSlug,
        description: plan.description,
        image_url: imageUrl,
        is_bestseller: !!plan.isBestseller,
        is_one_off: !!plan.isOneOff,
        shared_stock_pool: isTshirt,
        is_active: true, // normal/active product -- the stall-level flag above is what hides it
        sort_order: PRODUCT_PLAN.indexOf(plan),
      })
      .select("id")
      .single();
    if (productError) throw new Error(`Failed to create product "${plan.name}": ${productError.message}`);
    productIds.push(product.id);

    await supabase.from("product_images").insert({ product_id: product.id, url: imageUrl, sort_order: 0 });

    const variantRows = isTshirt
      ? plan.sizes.map((size) => ({ label: size, price: 5000, stock: plan.poolStock }))
      : plan.variants;

    const { data: insertedVariants, error: variantError } = await supabase
      .from("product_variants")
      .insert(
        variantRows.map((v) => ({
          product_id: product.id,
          label: v.label,
          price: v.price,
          stock: v.stock,
          weight_grams: defaultWeightGrams(plan.category, v.label),
        }))
      )
      .select("id, label, price, stock");
    if (variantError) throw new Error(`Failed to create variants for "${plan.name}": ${variantError.message}`);

    for (const v of insertedVariants) {
      // The 1-of-1 (isOneOff) variant is deliberately excluded from
      // orderableVariantPool below -- it should stay visibly available
      // (stock 1) in the screenshot, not show up "already sold" in fake
      // order history, which would read as a contradiction on close
      // inspection.
      variantPool.push({ variantId: v.id, productId: product.id, category: plan.category, label: v.label, price: Number(v.price), isOneOff: !!plan.isOneOff });
      totalStockUnits += v.stock;
    }
    console.log(`  + ${plan.name} (${plan.category}, ${variantRows.length} variant${variantRows.length === 1 ? "" : "s"})`);
  }

  // ---- vendor login ----
  const password = genPassword();
  const { error: authError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
    app_metadata: { role: "vendor", artist_id: artist.id, must_change_password: false },
  });
  if (authError) {
    // Don't leave an orphaned stall behind from a failed account creation.
    await supabase.from("artists").delete().eq("id", artist.id);
    throw new Error(
      `Failed to create the vendor login (stall rolled back): ${authError.message}` +
        (authError.message?.includes("already") ? `\nA user with email ${DEMO_EMAIL} already exists -- delete it manually or via "node scripts/demo-vendor.js delete" if it's a leftover.` : "")
    );
  }

  // ---- orders + status history (~8 weeks) ----
  const orderableVariantPool = variantPool.filter((v) => !v.isOneOff);
  let orderCount = 0;
  const statusCounts = {};
  const soldByProduct = new Map();

  for (const week of WEEK_PLAN) {
    for (const status of week.statuses) {
      const dayOffset = week.weeksAgo * 7 + crypto.randomInt(0, 7);
      const createdAt = addHours(daysAgo(dayOffset), -crypto.randomInt(0, 12)); // random time-of-day jitter

      // 1-3 distinct line items from this stall's own catalogue.
      const lineCount = 1 + crypto.randomInt(3);
      const chosen = new Set();
      while (chosen.size < lineCount && chosen.size < orderableVariantPool.length) {
        chosen.add(orderableVariantPool[crypto.randomInt(orderableVariantPool.length)]);
      }
      const items = Array.from(chosen).map((v) => ({ ...v, quantity: 1 + crypto.randomInt(3) }));

      const totalAmount = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const totalWeightGrams = items.reduce((sum, it) => sum + (defaultWeightGrams(it.category, it.label) ?? 0) * it.quantity, 0);
      const shippingMethod = determineShippingMethod(items.map((it) => ({ category: it.category, label: it.label })), totalWeightGrams);
      const customer = randomCustomer();

      const orderRow = {
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.address,
        status,
        payment_proof_url: null,
        total_amount: totalAmount,
        internal_notes: "Seeded demo data (scripts/demo-vendor.js) -- not a real order, safe to ignore.",
        created_at: createdAt.toISOString(),
        total_weight_grams: totalWeightGrams,
        is_bulk: totalWeightGrams > 1000,
        shipping_method: shippingMethod,
      };

      const isReviewed = status !== "awaiting_review";
      const approvedAt = isReviewed ? addHours(createdAt, 4 + crypto.randomInt(44)) : null; // 4h - 2d later
      if (isReviewed) {
        orderRow.reviewed_at = approvedAt.toISOString();
        orderRow.reviewed_by = DEMO_EMAIL;
      }

      let order;
      for (let attempt = 0; attempt < 8; attempt++) {
        const orderNumber = generateOrderNumber();
        const { data, error } = await supabase.from("orders").insert({ ...orderRow, order_number: orderNumber }).select("id").single();
        if (!error) {
          order = data;
          break;
        }
        if (error.code !== "23505") throw new Error(`Failed to create order: ${error.message}`);
      }
      if (!order) throw new Error("Could not allocate a unique order number after 8 attempts.");

      await supabase.from("order_items").insert(
        items.map((it) => ({ order_id: order.id, product_id: it.productId, variant_id: it.variantId, quantity: it.quantity, unit_price: it.price }))
      );

      // History mirrors app/admin/orders/actions.ts's transitionOrderStatus:
      // one row per transition actually taken, cumulative.
      const history = [];
      if (status === "approved" || status === "shipped" || status === "delivered") {
        history.push({ order_id: order.id, status: "approved", created_at: approvedAt.toISOString() });
      }
      let shippedAt = null;
      if (status === "shipped" || status === "delivered") {
        shippedAt = addHours(approvedAt, 24 + crypto.randomInt(48)); // 1-3d after approval
        history.push({ order_id: order.id, status: "shipped", created_at: shippedAt.toISOString() });
      }
      if (status === "delivered") {
        const deliveredAt = addHours(shippedAt, 48 + crypto.randomInt(72)); // 2-5d after shipping
        history.push({ order_id: order.id, status: "delivered", created_at: deliveredAt.toISOString() });
      }
      if (history.length) await supabase.from("order_status_history").insert(history);

      if (status === "approved" || status === "shipped" || status === "delivered") {
        for (const it of items) soldByProduct.set(it.productId, (soldByProduct.get(it.productId) ?? 0) + it.quantity);
      }

      orderCount++;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
  }

  // ---- offline (Vendor Mode) sales, spread across ~15 distinct days ----
  const OFFLINE_SALE_COUNT = 18;
  let offlineTotal = 0;
  for (let i = 0; i < OFFLINE_SALE_COUNT; i++) {
    const dayOffset = crypto.randomInt(0, 56);
    const soldAt = addHours(daysAgo(dayOffset), -crypto.randomInt(0, 20));
    const v = orderableVariantPool[crypto.randomInt(orderableVariantPool.length)];
    const quantity = 1 + crypto.randomInt(2);
    const { error } = await supabase.from("offline_sales").insert({
      artist_id: artist.id,
      product_id: v.productId,
      variant_id: v.variantId,
      quantity,
      unit_price: v.price,
      notes: "Seeded demo Vendor Mode sale -- not real.",
      sold_at: soldAt.toISOString(),
    });
    if (error) throw new Error(`Failed to create offline sale: ${error.message}`);
    offlineTotal += quantity * v.price;
    soldByProduct.set(v.productId, (soldByProduct.get(v.productId) ?? 0) + quantity);
  }

  // ---- sold_count (cosmetic "X sold" tag) ----
  for (const [productId, qty] of soldByProduct) {
    await supabase.from("products").update({ sold_count: qty }).eq("id", productId);
  }

  console.log(`\nDone.\n`);
  console.log("=".repeat(72));
  console.log(`DEMO STALL: ${DEMO_NAME}  (slug: ${DEMO_SLUG})`);
  console.log("=".repeat(72));
  console.log(`Login:      https://artkade.space/admin/login`);
  console.log(`Email:      ${DEMO_EMAIL}`);
  console.log(`Password:   ${password}`);
  console.log(`Role:       vendor (no admin, no stall switcher, no god mode)`);
  console.log(`Visibility: is_active = false -- does NOT appear on the public site`);
  console.log(`Demo flag:  ${isDemoFlagApplied ? "applied (is_demo = true)" : "NOT applied yet -- see warning above"}`);
  console.log("-".repeat(72));
  console.log(`Products:        ${productIds.length}  (total ${totalStockUnits} units in stock)`);
  console.log(`Online orders:   ${orderCount}  (${Object.entries(statusCounts).map(([s, n]) => `${n} ${s}`).join(", ")})`);
  console.log(`Offline sales:   ${OFFLINE_SALE_COUNT}  (Rs. ${offlineTotal.toLocaleString("en-US")} total)`);
  console.log("=".repeat(72));
  console.log(`\nTo tear all of this down later:\n  node scripts/demo-vendor.js delete\n`);
}

// ---------- DELETE ----------

async function del() {
  const supabase = getClient();

  let artist;
  {
    const withFlag = await supabase.from("artists").select("id, slug, is_demo").eq("slug", DEMO_SLUG).maybeSingle();
    if (withFlag.error && (withFlag.error.code === "42703" || /is_demo/.test(withFlag.error.message || ""))) {
      const noFlag = await supabase.from("artists").select("id, slug").eq("slug", DEMO_SLUG).maybeSingle();
      if (noFlag.error) throw new Error(`Failed to look up demo stall: ${noFlag.error.message}`);
      artist = noFlag.data ? { ...noFlag.data, is_demo: undefined } : null;
    } else if (withFlag.error) {
      throw new Error(`Failed to look up demo stall: ${withFlag.error.message}`);
    } else {
      artist = withFlag.data;
    }
  }

  if (!artist) {
    console.log(`No stall with slug "${DEMO_SLUG}" found -- nothing to delete.`);
    return;
  }
  if (artist.is_demo === false) {
    console.error(
      `Refusing to delete: a stall with slug "${DEMO_SLUG}" exists but is NOT flagged is_demo. ` +
        `This safety check exists so this script can never delete a real stall that happens to reuse the slug. Investigate manually.`
    );
    process.exit(1);
  }

  console.log(`Found "${DEMO_SLUG}" (id ${artist.id}). Deleting...`);

  const { data: products } = await supabase.from("products").select("id").eq("artist_id", artist.id);
  const productIds = (products ?? []).map((p) => p.id);

  let deletedOrders = 0;
  if (productIds.length) {
    const { data: matchingItems } = await supabase.from("order_items").select("order_id, product_id").in("product_id", productIds);
    const candidateOrderIds = Array.from(new Set((matchingItems ?? []).map((r) => r.order_id)));

    if (candidateOrderIds.length) {
      // Safety check: every order about to be deleted must consist
      // ENTIRELY of this demo stall's products. If any order also
      // contains a real stall's item (shouldn't happen -- this script only
      // ever creates single-stall demo orders -- but this is a destructive
      // script, so verify rather than assume), refuse to touch it and let
      // a human sort it out instead of silently deleting real order data.
      const { data: allItemsForCandidates } = await supabase
        .from("order_items")
        .select("order_id, product_id")
        .in("order_id", candidateOrderIds);
      const demoProductIdSet = new Set(productIds);
      const mixedOrderIds = new Set();
      for (const row of allItemsForCandidates ?? []) {
        if (!demoProductIdSet.has(row.product_id)) mixedOrderIds.add(row.order_id);
      }
      const safeOrderIds = candidateOrderIds.filter((id) => !mixedOrderIds.has(id));

      if (mixedOrderIds.size > 0) {
        console.warn(
          `WARNING: ${mixedOrderIds.size} order(s) contain both demo and non-demo items -- ` +
            `NOT deleting them automatically: ${Array.from(mixedOrderIds).join(", ")}\n` +
            `This shouldn't happen from a normal create run. Review these manually.`
        );
      }

      if (safeOrderIds.length) {
        // order_items and order_status_history both have "on delete
        // cascade" back to orders (see supabase/schema.sql) -- deleting
        // the order rows is enough.
        const { error } = await supabase.from("orders").delete().in("id", safeOrderIds);
        if (error) throw new Error(`Failed to delete demo orders: ${error.message}`);
        deletedOrders = safeOrderIds.length;
      }
    }
  }

  const { count: offlineSalesCount } = await supabase
    .from("offline_sales")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artist.id);
  await supabase.from("offline_sales").delete().eq("artist_id", artist.id);

  // Storage cleanup (product photos uploaded by create()).
  let deletedFiles = 0;
  const { data: files } = await supabase.storage.from(BUCKET).list(`products/${DEMO_SLUG}`, { limit: 1000 });
  if (files && files.length) {
    const paths = files.map((f) => `products/${DEMO_SLUG}/${f.name}`);
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.warn(`Warning: failed to delete some storage objects: ${error.message}`);
    else deletedFiles = paths.length;
  }

  // Cascades: products -> product_variants, product_images;
  // stall_collaborators. (offline_sales already deleted above.)
  const { error: artistDeleteError } = await supabase.from("artists").delete().eq("id", artist.id);
  if (artistDeleteError) throw new Error(`Failed to delete demo artist row: ${artistDeleteError.message}`);

  // Auth user: role/artist_id lives only in app_metadata, so find it by
  // paging through users rather than a direct lookup.
  let deletedUser = false;
  {
    let page = 1;
    const perPage = 200;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.warn(`Warning: failed to list auth users while looking for the demo vendor login: ${error.message}`);
        break;
      }
      const match = data.users.find((u) => u.app_metadata?.artist_id === artist.id || u.email === DEMO_EMAIL);
      if (match) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(match.id);
        if (delErr) console.warn(`Warning: failed to delete demo vendor login (${match.email}): ${delErr.message}`);
        else deletedUser = true;
        break;
      }
      if (data.users.length < perPage) break;
      page++;
    }
  }

  console.log("\nDeleted:");
  console.log(`  - Artist/stall row (cascaded ${productIds.length} product(s), their variants and images)`);
  console.log(`  - ${deletedOrders} online order(s) (cascaded their order_items and status history)`);
  console.log(`  - ${offlineSalesCount ?? 0} offline sale(s)`);
  console.log(`  - ${deletedFiles} storage file(s) under products/${DEMO_SLUG}/`);
  console.log(`  - Vendor login (${DEMO_EMAIL}): ${deletedUser ? "deleted" : "NOT FOUND -- check manually"}`);
  console.log("\nDone.");
}

// ---------- entrypoint ----------

async function main() {
  const cmd = process.argv[2];
  if (cmd === "create") return create();
  if (cmd === "delete") return del();
  console.error("Usage: node scripts/demo-vendor.js <create|delete>");
  process.exit(1);
}

main().catch((err) => {
  console.error("\nFailed:", err.message || err);
  process.exit(1);
});
