-- ============================================================
-- ART KADE — Core database schema
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
-- This covers the core of the PRD (stalls, products, order + approval flow,
-- popup stalls, magazine). Payments/shipping-rules
-- tables, analytics, and customer accounts are intentionally left for a
-- later pass once the core flow is working end to end.
-- ============================================================

-- ---------- ARTISTS / STALLS ----------
-- Vendor accounts (one per stall) are plain Supabase Auth users, same as
-- the admin account -- no separate profiles table. Their app_metadata
-- carries { role: "vendor", artist_id: "<this table's id>" }, set via the
-- Auth Admin API the same way the admin account's { role: "admin" } was
-- set. See middleware.ts and lib/session-role.ts.
--
-- Two more roles live in that same app_metadata.role, neither with a
-- column here (they're Auth metadata, not DB state, so there's nothing
-- to create -- noted here only so rebuilding from scratch doesn't miss
-- them):
--   - "restricted_admin": reads everywhere "admin" does (/admin/* and
--     /vendor/*, the latter to browse any stall's dashboard) but is
--     denied write access to catalogue/stall data by the server actions
--     themselves, not by this route gate -- see middleware.ts.
--   - app_metadata.must_change_password (boolean, any role): sits
--     alongside role rather than being its own role. A vendor or
--     restricted_admin account created via TempPasswordReveal (see
--     app/admin/vendors/create/route.ts and app/admin/staff/create/
--     route.ts) carries this until they set a real password --
--     middleware.ts redirects them to /vendor/change-password until
--     it's cleared by changePassword in app/vendor/actions.ts.
create table artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,               -- e.g. 'vdokade', 'nuwan-shilpa'
  name text not null,
  tagline text,
  bio text,
  logo_url text,
  hero_image_url text,
  accent_color text default '#C08A2E',     -- each stall can override the site accent
  is_popup boolean not null default false, -- true = temporary/pop-up stall
  popup_starts_at timestamptz,
  popup_ends_at timestamptz,
  is_active boolean not null default true, -- dashboard on/off switch for the whole stall
  sort_order int not null default 0,
  -- Sitewide footer's "Follow along" block (components/Footer.tsx): a real
  -- per-stall flag, not a hardcoded list, so a new/future vendor defaults
  -- to excluded and can be opted in later purely as a data change. socials
  -- is [{ "label": "Instagram", "url": "https://..." }, ...] so a whole new
  -- vendor's links are also data, not a code change.
  show_socials_in_footer boolean not null default false,
  socials jsonb not null default '[]'::jsonb,
  -- Vendor-controlled display order for this stall's product category
  -- sections (see the Stock tab's CategoryOrderBar). Null/empty means "use
  -- the site default" (lib/catalogue.ts's DEFAULT_CATEGORY_ORDER) --
  -- resolveCategoryOrder is what appends a category this stall has
  -- products in but hasn't arranged yet (a brand new stall, or one that
  -- added its first product in a category after last touching this
  -- setting), rather than that category silently vanishing off the stall
  -- page.
  category_order text[],
  created_at timestamptz not null default now(),
  -- Marks a disposable demo/screenshot stall (e.g. a pitch-deck demo
  -- account -- see scripts/demo-vendor.js) as opposed to a real vendor.
  -- Purely a reporting-exclusion flag: it has no effect on RLS or the
  -- public site (is_active above already fully controls visibility) --
  -- scripts/export-catalogue.js is the one place today that filters on it,
  -- since it's the only script that rolls catalogue data up into
  -- cross-stall totals. Added 2026-08-31, see
  -- supabase/2026-08-31-add-is-demo-flag.sql for the standalone migration
  -- that applied this to the live DB (this file is the fresh-install
  -- steady state, not itself run against an existing database).
  is_demo boolean not null default false
);

-- Read-only cross-stall visibility for collab stalls (e.g. Shilpa Kade is a
-- Vdokade x Nuwan Shilpa collab with no login of its own -- Nuwan gets a
-- read-only view of it inside his existing dashboard rather than a second
-- account). No public policies: staff/vendor-dashboard only, via the
-- service-role client, same as the orders tables below.
create table stall_collaborators (
  id uuid primary key default gen_random_uuid(),
  viewer_artist_id uuid not null references artists(id) on delete cascade,
  target_artist_id uuid not null references artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (viewer_artist_id, target_artist_id)
);

-- ---------- PRODUCTS ----------
create type product_category as enum ('sticker_pack','print','tshirt','digital','freebie','other');

create table products (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  category product_category not null,
  name text not null,
  -- Slugified from name at creation (see app/vendor/actions.ts); globally
  -- unique rather than scoped per-artist -- simpler lookup for the product
  -- detail route (/stalls/[stallSlug]/products/[productSlug]) and no two
  -- products in this catalogue have ever shared a name across artists.
  slug text unique not null,
  description text,
  image_url text,
  is_bestseller boolean not null default false,
  is_one_off boolean not null default false,   -- true = single edition, no restock (e.g. Nuwan's one-off colourways)
  sold_count int not null default 0,           -- real sold count, shown as the "X sold" tension tag
  sort_order int not null default 0,
  drop_ends_at timestamptz,                    -- optional countdown for a limited drop on this item
  is_active boolean not null default true,
  -- Per-product override for the apparel sizing chart shown via the "?"
  -- icon next to the size selector (see lib/sizing.ts and
  -- SizeGuideButton). Null (the common case) means "use the site-wide
  -- default measurement table" -- only relevant for category = 'tshirt',
  -- but not constrained to it at the DB level since a future apparel-like
  -- category might want the same override.
  sizing_chart_url text,
  -- Product-level sibling of product_variants.edition_size/stock: when
  -- true, every variant of this product shares ONE stock number instead of
  -- each tracking its own run independently (t-shirts -- one size selling
  -- out shrinks what's left for every other size). decrementStock/
  -- restoreStock (lib/stock.ts) apply a single delta to every sibling
  -- variant row when this is set, which keeps product_variants.stock
  -- identical across all of them -- that shared, synced value is what the
  -- per-size breakdown, the card, and the edition badge all read, so
  -- nothing downstream needs to know this flag exists. Prints stay on the
  -- default per-variant model.
  shared_stock_pool boolean not null default false,
  -- Vendor-facing toggle, separate from is_one_off (a single always-1
  -- item). When true, the product card shows a collective "N of M left"
  -- marker aggregated across all variants -- see lib/catalogue.ts's
  -- computeEditionAggregate. Purely a display concept; doesn't affect
  -- stock/edition_size tracking itself.
  is_exclusive_drop boolean not null default false,
  -- Third edition-display mode alongside a real edition_size ("limited",
  -- unaffected by this flag) and plain unset ("none", the default here).
  -- Only ever consulted for a product/variant that has no edition_size set
  -- -- lib/catalogue.ts's mapProduct/getProductDetail show remaining stock
  -- as "X in stock" instead of nothing when this is true. A real
  -- edition_size always wins and shows the Limited badge regardless of this
  -- flag's value.
  is_open_edition boolean not null default false,
  created_at timestamptz not null default now()
);

-- Variants cover sizes (A6/A5/A4/A3 prints, S/M/L tees) and sticker sizes
-- (Small/Medium/Large). Each sticker design is its own product -- there is
-- no bundle/pack concept: a customer buys one design at a time at its size
-- tier's price. Each variant carries its own stock and price.
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,          -- e.g. 'A5', 'Medium'
  price numeric(10,2) not null,
  stock int not null default 0, -- null/omit stock tracking for digital & freebies
  is_active boolean not null default true,
  -- Exists live but dead: no app code reads or writes it (grepped the
  -- whole repo, zero hits), and every one of the 145 live rows has it
  -- null. Looks like scaffolding for a bundled-sticker-pack concept that
  -- was never finished -- product_variants' own comment above already
  -- says explicitly "there is no bundle/pack concept" for stickers today.
  -- Documented here so schema.sql stops silently omitting a real column,
  -- not because it's actually in use -- a real candidate for `alter
  -- table product_variants drop column pack_size` whenever someone
  -- confirms nothing depends on it.
  pack_size int,
  -- Nullable: null means "not physically shipped" (digital/freebie) or an
  -- unrecognized print size that was never backfilled. Defaulted by
  -- category/size (see lib/shipping.ts's defaultWeightGrams) both in the
  -- one-time backfill and going forward whenever a vendor adds/edits a
  -- variant (see app/vendor/actions.ts).
  weight_grams int,
  -- Original run size for this specific variant's live countdown badge
  -- ("N of edition_size left") -- the generalized, per-variant sibling of
  -- products.is_one_off (which stays its own separate always-1 system).
  -- Null means this variant isn't a limited run at all (stickers, digital,
  -- freebies, or any print/tshirt variant that predates this system and
  -- hasn't been assigned one). `stock` is still the single source of truth
  -- for remaining count -- it already decrements on every sale regardless
  -- of edition_size, so the badge is just `stock` read against this fixed
  -- denominator, not a separately tracked counter.
  edition_size int
);

-- Product detail page's image gallery. products.image_url (the card
-- thumbnail) is left as its own column rather than folded into this table
-- -- every existing product gets exactly one row here at sort_order 0
-- (its current image_url, backfilled), and a product with no gallery rows
-- at all still renders as a single-image gallery on the detail page by
-- falling back to image_url. Multi-image upload is a separate task; this
-- table just needs to exist so the detail page has somewhere to read from.
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);

-- Exists live, entirely undocumented until this reconciliation pass, and
-- dead: zero rows, and no app code references this table at all (grepped
-- the whole repo). Reads like an abandoned prototype for a per-artist
-- reusable sticker-design library, separate from `products` -- there's a
-- matching sticker-designs/sticker-crud-test-* path in Storage full of
-- empty placeholder uploads from whatever testing produced this, which
-- is the only other trace of it anywhere. RLS is confirmed enabled live
-- with no policies (same pattern as offline_sales/stall_collaborators --
-- verified with an anon-key insert probe returning 42501, not a
-- constraint error). A real candidate for `drop table sticker_designs`
-- rather than building this out, unless someone specifically wants to
-- pick the feature back up.
--
-- artist_id's `on delete cascade` below mirrors every other artist_id FK
-- in this file for consistency -- not independently confirmed against
-- the live constraint definition (this table's real FK behavior wasn't
-- checked via pg_catalog), so treat it as a best guess, not a verified
-- fact, if it ever matters.
create table sticker_designs (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  name text not null,
  image_url text,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------- ORDERS ----------
create type order_status as enum (
  'awaiting_review',   -- customer uploaded payment proof, needs a human check
  'approved',
  'rejected',
  'out_of_stock',
  'shipped',
  'delivered',
  'cancelled'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,          -- human-friendly, e.g. ARTK-000482
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address text not null,
  status order_status not null default 'awaiting_review',
  payment_proof_url text,                     -- uploaded bank transfer screenshot
  total_amount numeric(10,2) not null,
  customer_notes text,
  internal_notes text,                        -- private, staff-only
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  -- Snapshotted at placeOrder time from product_variants.weight_grams
  -- (see lib/shipping.ts), not re-derived later -- a later catalogue edit
  -- shouldn't silently rewrite a past order's shipping classification,
  -- same reasoning as order_items.unit_price already being a snapshot.
  total_weight_grams int not null default 0,
  is_bulk boolean not null default false,        -- total_weight_grams > 1000
  shipping_method text                           -- 'registered_post' | 'courier'
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  -- Exists live but dead, same story as product_variants.pack_size above:
  -- no app code reference (grepped the whole repo), and there are
  -- currently zero order_items rows at all live to check for non-null
  -- values against. Likely paired scaffolding for the same unfinished
  -- bundled-sticker-pack concept. Flag for removal once confirmed unused,
  -- same as pack_size.
  sticker_pack_selection jsonb,
  quantity int not null default 1,
  unit_price numeric(10,2) not null
);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  note text,
  created_at timestamptz not null default now()
);

-- In-person sales a vendor logs at a physical event ("Vendor Mode") --
-- deliberately separate from orders/order_items: these never go through
-- the payment-proof/review flow, they just record a sale and decrement
-- stock immediately. No public policies: staff/vendor-dashboard only.
create table offline_sales (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  notes text,             -- optional per-sale note (e.g. "sold at a discount", buyer name)
  sold_at timestamptz not null default now()
);

-- ---------- SETTINGS ----------
-- Single-row payment instructions shown on the checkout page. Lives in the
-- DB (not a code config file) specifically so it can be edited directly in
-- the Supabase dashboard's Table Editor -- no code change or redeploy.
create table bank_transfer_details (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  branch text not null,
  account_holder_name text not null,
  account_number text not null,
  updated_at timestamptz not null default now()
);

alter table bank_transfer_details enable row level security;

create policy "public can read bank transfer details" on bank_transfer_details
  for select using (true);

-- ---------- FREEBIES ----------
-- Free digital downloads (wallpapers, ringtones, music, ebooks/zines,
-- etc), separate from `products`/`product_variants` on purpose: these
-- never go through the bag/checkout/order-approval flow at all -- the
-- public /freebies page links straight to file_url for an instant
-- download, no price, no stock, no order record.
create type freebie_category as enum ('wallpaper','ringtone','music','book','other');

create table freebies (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  description text,
  category freebie_category not null,
  file_url text not null,
  thumbnail_url text,
  created_at timestamptz not null default now()
);

-- ---------- BETA SIGNUPS ----------
-- Email capture on the pre-launch splash gate (app/gate) -- a lead-capture
-- path, NOT a password bypass. Deliberately minimal: no name, no dedup
-- constraint, nothing beyond what the gate page actually collects.
create table beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

-- ---------- MAGAZINE ----------
create table magazine_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,                       -- markdown
  hero_image_url text,
  category text,                   -- 'Interview', 'Behind the Scenes', 'Drop Announcement', etc
  artist_id uuid references artists(id),
  published boolean not null default false,
  published_at timestamptz,
  is_featured boolean not null default false, -- drives the magazine hero/"Latest Release" slot -- see the partial unique index below and app/admin/magazine/actions.ts's setFeaturedPost
  created_at timestamptz not null default now()
);

-- Business-rule constraint, not a performance index: at most one row can
-- ever have is_featured = true. app/admin/magazine/actions.ts's
-- setFeaturedPost already clears every other row before setting this one,
-- so this is a backstop against a future code path forgetting to, not the
-- primary enforcement.
create unique index magazine_posts_one_featured_idx on magazine_posts (is_featured) where is_featured;

-- ============================================================
-- INDEXES
-- None of the tables above had any indexes beyond what primary keys and
-- unique constraints create automatically (orders.order_number,
-- artists.slug, magazine_posts.slug, product_variants' implicit id pkey,
-- etc). Every index below matches a real .eq()/.order() call site or FK
-- cascade-delete path in the app, verified against a real Postgres
-- EXPLAIN plan at a realistic data volume (~20k orders/40k order_items)
-- rather than added blanket -- see the migration commit for the full
-- before/after EXPLAIN output.
-- ============================================================

-- Every catalogue page nests product_variants(...) under products -- the
-- single hottest join in the app.
create index if not exists idx_product_variants_product_id on product_variants(product_id);

-- The product detail page nests product_images(...) under products and
-- orders by sort_order, same access pattern as product_variants above.
create index if not exists idx_product_images_product_id on product_images(product_id, sort_order);

-- artist_id is filtered directly across the vendor/admin dashboards
-- (product management, deletes, dashboard counts) and joined via
-- artists.products(...) on every stall page; sort_order is the
-- near-universal accompanying ORDER BY, so this composite serves both
-- without needing a second index.
create index if not exists idx_products_artist_id_sort_order on products(artist_id, sort_order);

-- Same artist_id-filter pattern as products, for the vendor freebies list
-- and delete action.
create index if not exists idx_freebies_artist_id on freebies(artist_id);

-- Vendor Mode's offline-sales tally and the God dashboard's per-artist
-- sales count.
create index if not exists idx_offline_sales_artist_id on offline_sales(artist_id);

-- Nullified when an artist is deleted (see the God dashboard's
-- delete-vendor flow, app/admin/dashboard-actions.ts) -- that
-- UPDATE ... WHERE artist_id = $1 needs this same index.
create index if not exists idx_magazine_posts_artist_id on magazine_posts(artist_id);

-- The public magazine index page and app/sitemap.ts both filter
-- published = true and sort by published_at descending -- every real
-- call site filters on that exact same literal, so a partial index (only
-- published rows) serves it more cheaply than a full composite would.
create index if not exists idx_magazine_posts_published_at on magazine_posts(published_at) where published = true;

-- Deleting an artist cascades here on both columns. viewer_artist_id is
-- already covered by the existing (viewer_artist_id, target_artist_id)
-- unique constraint's index (it's the leftmost column, and it's also
-- filtered directly for a vendor's collab visibility) -- but
-- target_artist_id alone isn't covered by that composite, and needs its
-- own index for its half of the cascade-delete check.
create index if not exists idx_stall_collaborators_target_artist_id on stall_collaborators(target_artist_id);

-- The admin dashboard's pending-review queue (every God dashboard page
-- load, the vendor collab check, and the dashboard's pending count) runs
-- this exact filter+sort, and every .eq("status", ...) call site in the
-- app filters on this same literal -- a partial index (only
-- awaiting_review rows, which clear out quickly as orders get reviewed)
-- stays far smaller than a full composite over orders' whole lifetime and
-- serves the same query just as well (~80KB vs ~630KB in a 20k-row test,
-- see the migration commit for the full EXPLAIN comparison).
create index if not exists idx_orders_awaiting_review_created_at on orders(created_at) where status = 'awaiting_review';

-- Joined constantly (every order view nests order_items/
-- order_status_history under orders), and also the RESTRICT-checked FK
-- path when a product or variant is hard-deleted (see
-- app/vendor/actions.ts's deleteProduct).
create index if not exists idx_order_items_order_id on order_items(order_id);
create index if not exists idx_order_items_product_id on order_items(product_id);
create index if not exists idx_order_items_variant_id on order_items(variant_id);
create index if not exists idx_order_status_history_order_id on order_status_history(order_id);

-- Homepage, footer, freebies page, and Vendor Mode all sort stalls by
-- this.
create index if not exists idx_artists_sort_order on artists(sort_order);

-- The God dashboard's beta-signups list and CSV export both sort by
-- this.
create index if not exists idx_beta_signups_created_at on beta_signups(created_at);

-- orders.order_number already has a unique constraint (hence an
-- automatic index) -- the /track lookup (app/track/actions.ts) filters
-- by it alone and only ever compares customer_email in application code
-- afterward, never in a WHERE clause, so no separate index is needed for
-- either column for that feature.

-- ============================================================
-- ROW LEVEL SECURITY
-- Visitors (anon key) can only READ active/published catalogue data.
-- Orders/order_items are NOT anon-insertable, despite how this originally
-- shipped -- checkout used to insert straight from the browser via the
-- anon client (with check (true) on both tables), trusting whatever
-- price/total the client's own localStorage-backed bag state claimed.
-- That's a real hole: anyone hitting the Supabase REST API directly with
-- the (public) anon key could place an order at an arbitrary price,
-- bypassing the app entirely. Fixed by moving order creation into
-- app/checkout/actions.ts's placeOrder, a server action that uses the
-- service-role client and re-derives price/total/stock from the DB
-- instead of trusting the client -- and by dropping the anon insert
-- policies live to close the direct-API path too. There is now no anon
-- policy of any kind on orders/order_items/order_status_history; only
-- the service role key (which bypasses RLS) can read or write them.
-- ============================================================
alter table artists enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_images enable row level security;
alter table freebies enable row level security;
alter table magazine_posts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table offline_sales enable row level security;
alter table stall_collaborators enable row level security;
alter table beta_signups enable row level security;
alter table sticker_designs enable row level security;

create policy "public can read active artists" on artists
  for select using (is_active);

create policy "public can read active products" on products
  for select using (is_active);

create policy "public can read active variants" on product_variants
  for select using (is_active);

-- No is_active column on product_images either -- same reasoning as
-- freebies below: the public product detail page always reaches this
-- table through an already-active-filtered products query, so there's no
-- path that exposes an inactive product's gallery on its own.
create policy "public can read product images" on product_images
  for select using (true);

-- No is_active column on freebies (unlike products) -- every row is public
-- by design. The public page still filters to active stalls' freebies at
-- the query level (join against artists.is_active), same as products does
-- on the landing page feed, so an archived stall's freebies still vanish
-- even though this policy alone would allow reading them.
create policy "public can read freebies" on freebies
  for select using (true);

-- No insert/update/delete policies for freebies, same reasoning as
-- products/orders below: without a policy, RLS blocks anon writes
-- entirely. Only the service role key (vendor dashboard's server actions)
-- can write, and re-derives + checks artist ownership itself.

create policy "public can read published magazine posts" on magazine_posts
  for select using (published);

-- Write-only for anon (unlike orders/order_items below, which are closed
-- to anon entirely): no select policy means RLS blocks reads for anyone
-- but the service role, so collected emails are never publicly readable
-- even though anyone can submit one. Safe to leave this one genuinely
-- anon-insertable -- worst case is spam rows in a lead-capture table, not
-- a forged price/order the way an open orders policy was.
create policy "anyone can submit a beta signup" on beta_signups
  for insert with check (true);

-- No policies at all -- insert included -- are created for orders/
-- order_items/order_status_history, on purpose: without a policy, RLS
-- blocks every action entirely for the anon key. Only the service role
-- key (which bypasses RLS) can read or write them -- that's what
-- app/checkout/actions.ts's placeOrder and the admin dashboard's server
-- actions both use. (This table used to carry an anon insert policy --
-- see this file's own git history, or the ROW LEVEL SECURITY section
-- comment above, for why it was dropped.)

-- ============================================================
-- OPS: FREE-TIER USAGE MONITORING
-- Backs scripts/check-usage.js and docs/free-tier-checklist.md. Database
-- size isn't reachable through the normal Data API (PostgREST only
-- exposes tables/views, not built-in functions like pg_database_size),
-- so this small RPC wrapper is the one piece of that checklist that
-- needs a real schema object rather than just a REST/Storage API call.
--
-- security invoker (not definer): pg_database_size() only needs the
-- privilege to connect to the current database, which the caller
-- (service_role, see the grant below) already has -- there's no reason
-- to run this as a more-privileged role. Explicit search_path prevents
-- the function from resolving pg_catalog names to something else if a
-- malicious schema were ever added ahead of it.
create or replace function public.get_db_stats()
returns table (
  database_size_bytes bigint,
  public_table_count bigint
)
language sql
security invoker
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database()),
    (select count(*)::bigint from information_schema.tables where table_schema = 'public');
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default,
-- which cascades to anon/authenticated -- revoke first so this is
-- service_role-only (database size isn't sensitive, but there's no
-- reason to hand it to anonymous callers either).
revoke all on function public.get_db_stats() from public;
grant execute on function public.get_db_stats() to service_role;
