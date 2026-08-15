-- ============================================================
-- ART KADE — Seed data
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
-- (after schema.sql). Safe to re-run: clears any existing rows for these
-- three stalls first, then inserts fresh.
--
-- Image URLs point at the public "media" storage bucket (Storage ->
-- media -> vdo_media / shilpa_kade_media folders). The bucket must be
-- public for these plain URLs to resolve.
-- ============================================================

delete from artists where slug in ('vdokade', 'nuwan-shilpa', 'shilpa-kade');

insert into artists (slug, name, tagline, accent_color, is_active, sort_order, logo_url) values
  ('vdokade', 'Vdokade', 'Susanthika, Premasiri and the rest of the mess.', '#C08A2E', true, 1,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/logo.webp'),
  ('nuwan-shilpa', 'Nuwan Shilpa', 'His art, his prints, his rules.', '#4C7A64', true, 2, null),
  ('shilpa-kade', 'Shilpa Kade', 'Where Vdokade x Nuwan Shilpa collide.', '#8B5E3C', true, 3, null);

-- Vdokade stickers -- the original seven plus nine new standalone designs.
-- A few filenames (cop-computer, cop-hand-up, sir-office-chair) read badly
-- as product names as-is, so those are lightly reworded; the rest are kept
-- close to the source filename.
--
-- slug is required (products.slug is not-null, no default -- this file
-- originally omitted it entirely and failed outright on a fresh run) --
-- values below are the real live slugs (app/vendor/actions.ts's slugify,
-- lib/slug.ts), not freshly re-derived from these names, so a reseed
-- lines up with the URLs product/product_images pages elsewhere already
-- link to.
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, slug, is_bestseller, sort_order, image_url)
select v.id, 'sticker_pack', x.name, x.slug, x.is_bestseller, x.sort_order, x.image_url
from v, (values
  ('Premasiri', 'premasiri', true, 1,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/premasiri.png'),
  ('Ammi Ammi Ammi', 'ammi-ammi-ammi', false, 2,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/ammi-ammi-ammi.png'),
  ('Duca', 'duca', false, 3,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/duca.png'),
  ('Kesel Gedi', 'kesel-gedi', false, 4,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/kesel-gedi.png'),
  ('Oneriarchy', 'oneriarchy', false, 5,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/oneriarchal.png'),
  ('Premasiri Thoo Modayek', 'premasiri-thoo-modayek', false, 6,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/premasiri-thoo-modayek.png'),
  ('Ringtone', 'ringtone', false, 7,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/ringtone.png'),
  ('Computer Cop', 'computer-cop', false, 9,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/cop-computer.png'),
  ('Cop Hands Up', 'cop-hands-up', false, 10,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/cop-hand-up.png'),
  ('Dad Standing', 'dad-standing', false, 11,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/dad-standing.png'),
  ('Prema Waving', 'prema-waving', false, 12,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/prema-waving.png'),
  ('Sir In The Office Chair', 'sir-in-the-office-chair', false, 13,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/sir-office-chair.png'),
  ('Susie Carries Prema', 'susie-carries-prema', false, 14,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/susie-carries-prema.png'),
  ('Susie Skydiver', 'susie-skydiver', false, 15,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/susie-skydiver.png'),
  ('Baby', 'baby', false, 16,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/baby.png'),
  ('Balla', 'balla', false, 17,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Stickers/balla.png')
) as x(name, slug, is_bestseller, sort_order, image_url);

-- Vdokade print -- uses the dedicated A3 poster artwork. slug is the real
-- live one (susanthika-premasiri-print) -- the product was since renamed
-- to "Susie Splosion" live, but slugs are set once at creation and never
-- regenerated on a later rename (lib/slug.ts), so the slug is still this
-- even though the name has moved on. Kept the original name here rather
-- than following that rename: this file is the original seed data, not a
-- live mirror of every subsequent catalogue edit.
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, slug, sort_order, image_url)
select v.id, 'print', 'Susanthika & Premasiri Print', 'susanthika-premasiri-print', 8,
  'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/Prints/a3%20Poster%20-%20VDO-%2006-01-2026.png'
from v;

-- Shilpa Kade collab print. slug is the real live one
-- (chronos-couples-chaos, without "-v2" -- same "slug predates a later
-- name edit" situation as the print above).
with s as (select id from artists where slug = 'shilpa-kade')
insert into products (artist_id, category, name, slug, sort_order, image_url)
select s.id, 'print', 'Chronos Couples & Chaos v2', 'chronos-couples-chaos', 1,
  'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/shilpa_kade_media/Chronos,Couples%20&%20Chaos%20%20v2%20-%20Nuwanshilpa%20x%20Vdokade%20Collab%20print.png'
from s;

-- Sticker tiers -- applies to every artist's sticker_pack products, not
-- just vdokade's, so future stalls' stickers get the same tiers for free.
insert into product_variants (product_id, label, price, stock)
select p.id, x.label, x.price, x.stock
from products p
join (values
  ('Small, sticker paper laminated', 200, 40),
  ('Medium, PVC laminated', 300, 25),
  ('Large, PVC laminated', 600, 15)
) as x(label, price, stock) on true
where p.category = 'sticker_pack';

-- Print sizes -- applies to every print product, so vdokade's print and
-- Shilpa Kade's new collab print share the same A6/A5/A3 pricing.
insert into product_variants (product_id, label, price, stock)
select p.id, x.label, x.price, x.stock
from products p
join (values
  ('A6', 1000, 20),
  ('A5', 1500, 15),
  ('A3', 5000, 5)
) as x(label, price, stock) on true
where p.category = 'print';

-- Bank transfer details -- placeholder only. Only inserted if the table is
-- currently empty, so re-running this file later (e.g. to reseed products)
-- never overwrites the real values once they've been set via the Supabase
-- dashboard's Table Editor.
insert into bank_transfer_details (bank_name, branch, account_holder_name, account_number)
select 'TBD', 'TBD', 'TBD', 'TBD'
where not exists (select 1 from bank_transfer_details);
