-- ============================================================
-- ART KADE — Seed data
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
-- (after schema.sql). Safe to re-run: clears any existing rows for these
-- three stalls first, then inserts fresh.
-- ============================================================

delete from artists where slug in ('vdokade', 'nuwan-shilpa', 'shilpa-kade');

insert into artists (slug, name, tagline, accent_color, is_active, sort_order) values
  ('vdokade', 'Vdokade', 'Susanthika, Premasiri and the rest of the mess.', '#C08A2E', true, 1),
  ('nuwan-shilpa', 'Nuwan Shilpa', 'Guest stall — his art, his prints, his rules.', '#4C7A64', true, 2),
  ('shilpa-kade', 'Shilpa Kade', 'Where Vdokade x Nuwan Shilpa collide.', '#8B5E3C', true, 3);

-- Vdokade stickers
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, is_bestseller, sort_order)
select v.id, 'sticker_pack', x.name, x.is_bestseller, x.sort_order
from v, (values
  ('Premasiri', true, 1),
  ('Ammi Ammi Ammi', false, 2),
  ('Duca', false, 3),
  ('Kesel Gedi', false, 4),
  ('Oneriarchy', false, 5),
  ('Premasiri Thoo Modayek', false, 6),
  ('Ringtone', false, 7)
) as x(name, is_bestseller, sort_order);

-- Vdokade print
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, sort_order)
select v.id, 'print', 'Susanthika & Premasiri Print', 8 from v;

-- Sticker tiers -- applies to every artist's sticker_pack products, not
-- just vdokade's, so future stalls' stickers get the same tiers for free.
insert into product_variants (product_id, label, price, stock)
select p.id, x.label, x.price, x.stock
from products p
join (values
  ('Small — Sticker paper laminated', 200, 40),
  ('Medium — PVC Laminated', 300, 25),
  ('Large — PVC Laminated', 600, 15)
) as x(label, price, stock) on true
where p.category = 'sticker_pack';

-- Print sizes (vdokade's print only, for now)
insert into product_variants (product_id, label, price, stock)
select p.id, x.label, x.price, x.stock
from (values
  ('Susanthika & Premasiri Print', 'A6', 1000, 20),
  ('Susanthika & Premasiri Print', 'A5', 1500, 15),
  ('Susanthika & Premasiri Print', 'A3', 5000, 5)
) as x(product_name, label, price, stock)
join products p on p.name = x.product_name
join artists a on a.id = p.artist_id and a.slug = 'vdokade';
