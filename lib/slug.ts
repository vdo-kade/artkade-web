// Same slugification rule used for the one-time products.slug backfill
// migration (see supabase/schema.sql) -- keep both in sync if this ever
// changes.
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product"
  );
}

type SlugCheckClient = {
  from(table: "products"): {
    select(columns: "slug"): {
      ilike(column: "slug", pattern: string): PromiseLike<{ data: { slug: string }[] | null }>;
    };
  };
};

// Slugs are set once at creation and never regenerated on a later rename
// (see app/vendor/actions.ts's updateProduct) -- a shared/bookmarked
// product URL should stay stable even if the vendor edits the name. Only
// creation needs to resolve a collision, by suffixing -2, -3, etc.
export async function uniqueProductSlug(supabase: SlugCheckClient, name: string): Promise<string> {
  const base = slugify(name);
  const { data: existing } = await supabase.from("products").select("slug").ilike("slug", `${base}%`);
  const taken = new Set((existing ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
