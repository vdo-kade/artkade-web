# Supabase Free-tier health check

Run this at the **start of every session**. The project is on Supabase's
Free plan, deliberately not upgraded until sales justify it, which means
every one of these limits is a real wall, not a soft warning:

| Limit | Free tier cap |
|---|---|
| Cached Egress | 5 GB / month |
| Database size | 500 MB |
| Storage size | 1 GB |
| Monthly Active Users | 50,000 |

Going over Cached Egress specifically doesn't 402 immediately, but Supabase
restricts the project if an org **stays** over quota into a second billing
cycle. That's the failure mode this guards against: catch a bad trend
early enough in a cycle to fix it before the next one closes.

## One-time setup (skip if already done)

Database size isn't reachable through the normal Data API — PostgREST
only exposes tables/views, not built-in functions like
`pg_database_size()`. Run this once in the Supabase SQL editor (it's
already in `supabase/schema.sql` under "OPS: FREE-TIER USAGE MONITORING",
this is just the copy-pasteable version):

```sql
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

revoke all on function public.get_db_stats() from public;
grant execute on function public.get_db_stats() to service_role;
```

If `npm run check-usage` reports `Could not find the function
public.get_db_stats`, this hasn't been run yet (or was run against the
wrong project).

## Step 1 — run the automated part

```bash
npm run check-usage
```

This is a real script (`scripts/check-usage.js`), not a prose reminder.
It prints, with a 🟢 OK / 🟡 WARN (≥70%) / 🔴 CRITICAL (≥90%) marker on
each line:

- **Database size**, via the RPC above, against the 500 MB cap.
- **Storage size**, walking every bucket via the Storage API and summing
  real object sizes, against the 1 GB cap, broken down per bucket.
- **Total auth user count**, against the 50,000 MAU cap. This is a lower
  bound, not the real MAU figure (see Step 2) — it can only ever undercount,
  since it's every user who ever signed up, not just this month's active
  ones, so treat it as a floor, not the answer.

Exit code is 1 if anything automated came back CRITICAL, 0 otherwise — safe
to wire into a CI job later if that ever becomes useful.

## Step 2 — check egress manually (not automatable)

Cached Egress and Egress are what actually gate the Free plan, and there is
**no API for either** — not the Data API, not the Management API. This was
verified against `api.supabase.com`'s own OpenAPI spec while building this
checklist: the only usage-adjacent endpoints that exist are for billing
addons/compute sizing, nothing exposes egress or usage metrics. The
dashboard's own usage page calls an internal, session-authenticated
endpoint that isn't part of the public API surface.

Open (this exact project-scoped URL redirects to the right org/usage page
automatically, so it doesn't need the org slug hardcoded anywhere):

```
https://supabase.com/dashboard/project/<project-ref>/settings/billing/usage
```

(Project ref is the subdomain in `NEXT_PUBLIC_SUPABASE_URL`, e.g.
`knetfofbdjsthqienegg`.)

Read the **Usage Summary** card:

- **Cached Egress** vs the 5 GB cap — if this is past 4 GB (80%), treat it
  as CRITICAL exactly like an automated line would be. If there's a banner
  saying the org exceeded quota and projects will be restricted by a
  specific date, that date is a hard deadline, not a suggestion.
- **Egress** (uncached) — smaller number, same idea, less urgent since it's
  not the plan-defining metric but still worth a glance.
- **Monthly Active Users** — the real figure, not the auth-user floor from
  Step 1.

If you want the day-by-day trend (e.g. to confirm a fix actually reduced
egress after it ships), click into "Cached Egress" from that page — it
breaks the total down into a per-day chart for the current billing cycle.

## If something's close to a limit

- **Storage/Database close to their caps**: these are slow-moving and
  rarely the surprise. Check what's actually large (the script's per-bucket
  breakdown, or `SELECT pg_size_pretty(pg_total_relation_size(...))` per
  table) before deleting anything.
- **Cached Egress close to its cap**: this is the one that actually moves
  fast with real traffic. Known contributors and their current state, so a
  future session doesn't have to rediscover this from scratch:
  - Supabase Storage serves every object with `Cache-Control: no-cache`
    regardless of the object's own metadata — confirmed not fixable from
    the app side (verified by uploading a test file with an explicit long
    `cacheControl` and getting `no-cache` back anyway). This is why
    `next.config.js` routes every catalogue image through `next/image`
    with `minimumCacheTTL` raised to a week — Vercel's optimizer fetches
    the original once, then serves *its own* Cache-Control on repeats,
    sidestepping Supabase's header entirely. Confirmed working live:
    `X-Vercel-Cache: HIT` on a second request to the same `/_next/image`
    URL, `Cache-Control: public, max-age=604800`.
  - Anything that links **directly** to a Storage URL instead of going
    through `next/image` gets none of that protection — freebie
    downloads (ringtones, PDFs, and the full-size wallpaper file itself,
    as opposed to its thumbnail preview) used to do exactly this. See
    `app/api/freebie/[id]/route.ts` for the fix (a caching proxy, same
    idea as `next/image`'s, for the one category of asset that isn't an
    image `next/image` can transform).
  - If Cached Egress is high again and neither of the above explains it,
    the next place to look is `export const revalidate = 0` — it's used
    on nearly every page in this app (deliberately, so admin/vendor
    dashboards and stock counts are never stale), which means zero
    server-side caching of the rendered HTML/data on top of whatever
    Storage/image caching is in place. Moving specific *public,
    read-heavy* pages (homepage, stall pages) to a real ISR window
    (e.g. `revalidate = 60`) would cut this further, but touches
    correctness (stock/price freshness) and deserves its own careful,
    scoped pass rather than a blanket change.
