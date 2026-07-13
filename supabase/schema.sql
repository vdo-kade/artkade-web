-- ============================================================
-- ART KADE — Core database schema
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
-- This covers the core of the PRD (stalls, products, sticker-pack builder,
-- order + approval flow, popup stalls, magazine). Payments/shipping-rules
-- tables, analytics, and customer accounts are intentionally left for a
-- later pass once the core flow is working end to end.
-- ============================================================

-- ---------- ARTISTS / STALLS ----------
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

-- Variants cover sizes (A6/A5/A4/A3 prints, S/M/L tees) and sticker PACK
-- SIZES (4/6/10). Each variant carries its own stock and price.
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,          -- e.g. 'A5', 'Medium', '6-pack'
  price numeric(10,2) not null,
  stock int not null default 0, -- null/omit stock tracking for digital & freebies
  is_active boolean not null default true
);

-- Individual sticker designs an artist has, used to build a custom pack
-- (independent of "products" -- a pack is a product; these are the designs
-- a customer picks from to fill that pack).
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
  reviewed_by text
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  -- for a build-your-own sticker pack: the specific sticker_design ids chosen,
  -- e.g. '["<id1>","<id2>","<id3>","<id4>"]' for a 4-pack
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

-- ---------- HELPFUL VIEW ----------
-- Stock remaining per product across its variants, for the "Only 8 left" tag.
create view product_stock as
  select product_id, sum(stock) as total_stock
  from product_variants
  where is_active
  group by product_id;

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
alter table sticker_designs enable row level security;
alter table magazine_posts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;

create policy "public can read active artists" on artists
  for select using (is_active);

create policy "public can read active products" on products
  for select using (is_active);

create policy "public can read active variants" on product_variants
  for select using (is_active);

create policy "public can read active sticker designs" on sticker_designs
  for select using (is_active);

create policy "public can read published magazine posts" on magazine_posts
  for select using (published);

create policy "anyone can place an order" on orders
  for insert with check (true);

create policy "anyone can add items to their own order" on order_items
  for insert with check (true);

-- No select/update/delete policies are created for orders/order_items/
-- order_status_history on purpose: without a policy, RLS blocks the
-- action entirely for the anon key. Only the service role key (which
-- bypasses RLS) can read or update them -- that's what the admin
-- dashboard's server-side code should use.
