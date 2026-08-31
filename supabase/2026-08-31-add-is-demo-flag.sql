-- ============================================================
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
-- Adds a flag to mark disposable demo/screenshot stalls (e.g. the pitch-deck
-- "Demo Kade" account, see scripts/demo-vendor.js) so reporting/export
-- scripts can exclude them from real totals. Additive and safe: default
-- false, every existing row is unaffected.
-- ============================================================

alter table artists add column if not exists is_demo boolean not null default false;

comment on column artists.is_demo is
  'Marks a disposable demo/screenshot stall (not a real vendor). Reporting '
  'and export scripts (e.g. scripts/export-catalogue.js) should exclude '
  'these from real totals. Set/unset by scripts/demo-vendor.js.';
