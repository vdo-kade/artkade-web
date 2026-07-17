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
  created_at timestamptz not null default now()
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
  description text,
  image_url text,
  is_bestseller boolean not null default false,
  is_one_off boolean not null default false,   -- true = single edition, no restock (e.g. Nuwan's one-off colourways)
  sold_count int not null default 0,           -- real sold count, shown as the "X sold" tension tag
  sort_order int not null default 0,
  drop_ends_at timestamptz,                    -- optional countdown for a limited drop on this item
  is_active boolean not null default true,
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
  is_active boolean not null default true
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
  reviewed_by text
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
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
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Visitors (anon key) can only READ active/published catalogue data.
-- Orders can be INSERTED by anon (a customer placing an order) but never
-- read back or edited by anon -- only staff, via the service role key,
-- can review/approve/update orders. Wire the dashboard's server actions
-- to use the service role key (kept server-side only, see .env.local.example).
-- ============================================================
alter table artists enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table freebies enable row level security;
alter table magazine_posts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table offline_sales enable row level security;
alter table stall_collaborators enable row level security;
alter table beta_signups enable row level security;

create policy "public can read active artists" on artists
  for select using (is_active);

create policy "public can read active products" on products
  for select using (is_active);

create policy "public can read active variants" on product_variants
  for select using (is_active);

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

create policy "anyone can place an order" on orders
  for insert with check (true);

create policy "anyone can add items to their own order" on order_items
  for insert with check (true);

-- Write-only for anon, same reasoning as orders above: no select policy
-- means RLS blocks reads entirely for anyone but the service role, so
-- collected emails are never publicly readable even though anyone can
-- submit one.
create policy "anyone can submit a beta signup" on beta_signups
  for insert with check (true);

-- No select/update/delete policies are created for orders/order_items/
-- order_status_history on purpose: without a policy, RLS blocks the
-- action entirely for the anon key. Only the service role key (which
-- bypasses RLS) can read or update them -- that's what the admin
-- dashboard's server-side code should use.
