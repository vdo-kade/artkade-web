# Art Kade — starter codebase

This is a **v0.1 scaffold**, not the finished platform. It's a real Next.js
project with the design direction, page structure, and database schema from
the PRD, using placeholder data so it runs and looks right immediately. From
here, keep building it feature by feature — ideally in **Claude Code**, since
it's now a proper multi-file codebase rather than something that fits in one
chat message.

## What's actually built

- Landing page: hero, the pinned "sticker wheel" side element, featured
  stalls, featured drop grid, the 6-step shopping process
- A shared stall page template (`app/stalls/[slug]/page.tsx`) used by every
  artist, with product sections and a countdown for pop-up stalls
- A magazine listing page stub
- The full core database schema (`supabase/schema.sql`) — artists, products,
  variants, sticker designs, orders, order items, magazine posts, plus Row
  Level Security so visitors can only read active/published catalogue data
  and orders can only be reviewed by staff
- Design tokens (colours, type) matching the PRD's direction in
  `tailwind.config.ts`

## What's still stubbed / not built yet

Everything reads from **hard-coded mock data** right now, not from Supabase.
None of these are built yet:
- Actually connecting pages to Supabase (the client helper is ready in
  `lib/supabase.ts`, but no page calls it yet)
- The admin/artist dashboard (product management, order approval, media
  library, magazine editor)
- Payment-proof upload + the approval workflow
- The build-your-own sticker pack picker UI
- Customer accounts, email sending, vendor mode, analytics

This is a lot — that's expected for a platform this size. Tackle it in
slices: connect the catalogue read-only first, then orders, then the
dashboard, then everything else.

## 1. Accounts you need to create yourself

I can't create these for you, but here's exactly what to do:

**GitHub** (free) — create an account, then create a new repository and
push this folder to it. This is what Vercel deploys from.

**Supabase** (free tier is enough to start):
1. Go to supabase.com → sign up → "New Project"
2. Pick a name, a database password (save it somewhere safe), and a region
   close to Sri Lanka (Singapore is usually closest)
3. Once it's created, go to **Project Settings → API** and copy the
   "Project URL" and the "anon public" key
4. Go to the **SQL Editor**, paste the entire contents of
   `supabase/schema.sql`, and click **Run** — this creates all the tables
5. Go to **Storage** and create a bucket called `media` (for product photos
   and payment-proof uploads)

**Vercel** (free tier is enough to start):
1. Go to vercel.com → sign up with your GitHub account
2. "Add New Project" → import the GitHub repo you just pushed
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Supabase step 3 above)
4. Click Deploy

**Namecheap → Vercel domain connection** (artkade.space):
1. In Vercel, go to your project → Settings → Domains → add `artkade.space`
2. Vercel will show you either an A record or a CNAME to add
3. In Namecheap, go to Domain List → Manage → Advanced DNS, and add the
   record Vercel showed you
4. DNS changes can take up to a few hours to go live

## 2. Running it locally (or in Claude Code)

```bash
npm install
cp .env.local.example .env.local   # then fill in your real Supabase values
npm run dev
```

Then open http://localhost:3000

## 3. Suggested build order

1. Connect the landing page + stall pages to real Supabase data (replace
   the mock arrays with queries)
2. Build the checkout flow: bag → customer details → payment-proof upload
   → order saved as `awaiting_review`
3. Build a simple internal orders view (even a bare-bones table listing
   `awaiting_review` orders) so you can approve/reject manually
4. Add the sticker-pack builder UI
5. Layer in the rest: magazine editor, media library, analytics, vendor
   mode

Take this repo into **Claude Code** to keep going — it's built for exactly
this kind of ongoing, multi-file project.
