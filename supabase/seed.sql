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
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/logo.png'),
  ('nuwan-shilpa', 'Nuwan Shilpa', 'His art, his prints, his rules.', '#4C7A64', true, 2, null),
  ('shilpa-kade', 'Shilpa Kade', 'Where Vdokade x Nuwan Shilpa collide.', '#8B5E3C', true, 3, null);

-- Vdokade stickers -- the original seven plus nine new standalone designs.
-- A few filenames (cop-computer, cop-hand-up, sir-office-chair) read badly
-- as product names as-is, so those are lightly reworded; the rest are kept
-- close to the source filename.
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, is_bestseller, sort_order, image_url)
select v.id, 'sticker_pack', x.name, x.is_bestseller, x.sort_order, x.image_url
from v, (values
  ('Premasiri', true, 1,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/premasiri.png'),
  ('Ammi Ammi Ammi', false, 2,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/ammi-ammi-ammi.png'),
  ('Duca', false, 3,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/duca.png'),
  ('Kesel Gedi', false, 4,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/kesel-gedi.png'),
  ('Oneriarchy', false, 5,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/oneriarchal.png'),
  ('Premasiri Thoo Modayek', false, 6,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/premasiri-thoo-modayek.png'),
  ('Ringtone', false, 7,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/ringtone.png'),
  ('Computer Cop', false, 9,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/cop-computer.png'),
  ('Cop Hands Up', false, 10,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/cop-hand-up.png'),
  ('Dad Standing', false, 11,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/dad-standing.png'),
  ('Prema Waving', false, 12,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/prema-waving.png'),
  ('Sir In The Office Chair', false, 13,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/sir-office-chair.png'),
  ('Susie Carries Prema', false, 14,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/susie-carries-prema.png'),
  ('Susie Skydiver', false, 15,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/susie-skydiver.png'),
  ('Baby', false, 16,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/baby.png'),
  ('Balla', false, 17,
    'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/balla.png')
) as x(name, is_bestseller, sort_order, image_url);

-- Vdokade print -- uses the dedicated A3 poster artwork.
with v as (select id from artists where slug = 'vdokade')
insert into products (artist_id, category, name, sort_order, image_url)
select v.id, 'print', 'Susanthika & Premasiri Print', 8,
  'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/a3%20Poster%20-%20VDO-%2006-01-2026.png'
from v;

-- Shilpa Kade collab print.
with s as (select id from artists where slug = 'shilpa-kade')
insert into products (artist_id, category, name, sort_order, image_url)
select s.id, 'print', 'Chronos Couples & Chaos v2', 1,
  'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/shilpa_kade_media/Chronos,Couples%20&%20Chaos%20%20v2%20-%20Nuwanshilpa%20x%20Vdokade%20Collab%20print.png'
from s;

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

-- Sticker designs (individual designs for the build-your-own-pack picker) --
-- the nine new ones only; the original seven aren't split out as pack
-- designs yet.
with v as (select id from artists where slug = 'vdokade')
insert into sticker_designs (artist_id, name, image_url, sort_order)
select v.id, x.name, x.image_url, x.sort_order
from v, (values
  ('Computer Cop', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/cop-computer.png', 1),
  ('Cop Hands Up', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/cop-hand-up.png', 2),
  ('Dad Standing', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/dad-standing.png', 3),
  ('Prema Waving', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/prema-waving.png', 4),
  ('Sir In The Office Chair', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/sir-office-chair.png', 5),
  ('Susie Carries Prema', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/susie-carries-prema.png', 6),
  ('Susie Skydiver', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/susie-skydiver.png', 7),
  ('Baby', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/baby.png', 8),
  ('Balla', 'https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/vdo_media/balla.png', 9)
) as x(name, image_url, sort_order);

-- Bank transfer details -- placeholder only. Only inserted if the table is
-- currently empty, so re-running this file later (e.g. to reseed products)
-- never overwrites the real values once they've been set via the Supabase
-- dashboard's Table Editor.
insert into bank_transfer_details (bank_name, branch, account_holder_name, account_number)
select 'TBD', 'TBD', 'TBD', 'TBD'
where not exists (select 1 from bank_transfer_details);
