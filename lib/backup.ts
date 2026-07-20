import type { createAdminClient } from "./supabase-admin";

// Supabase's free tier has no automatic backups -- this is a lightweight
// stand-in, not a pg_dump replacement (no schema, no RLS policies, no
// Storage objects themselves, just row data for the tables that would
// actually hurt to lose). See README.md's "Backups" section for the
// manual restore procedure.
export const BACKUP_BUCKET = "backups";
export const BACKUP_TABLES = [
  "artists",
  "products",
  "product_variants",
  "orders",
  "order_items",
  "order_status_history",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupResult = { path: string; rowCounts: Record<BackupTable, number> };

// PostgREST caps a single response at 1000 rows by default -- fine for
// this project's current scale on every one of these tables, but orders/
// order_items/order_status_history will eventually cross that as the
// catalogue and order history grow, so this paginates rather than
// silently truncating a real backup.
async function fetchAllRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: BackupTable
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// The one function shared by the weekly cron route and the manual
// verification trigger -- exports every row of each table above into a
// single timestamped JSON file in the private "backups" Storage bucket.
// Service-role only: there's no anon policy on this bucket (same
// "private, service-role-only" pattern as payment-proofs -- see
// app/api/upload-payment-proof/route.ts), and it never needs one, since
// nothing but this export and a manual restore ever touches it.
export async function runTableBackup(
  supabase: ReturnType<typeof createAdminClient>,
  now: Date = new Date()
): Promise<BackupResult> {
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const table of BACKUP_TABLES) {
    tables[table] = await fetchAllRows(supabase, table);
  }

  const payload = JSON.stringify({ exportedAt: now.toISOString(), tables }, null, 2);
  const path = `backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;

  const { error: uploadError } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(path, new TextEncoder().encode(payload), { contentType: "application/json" });
  if (uploadError) throw uploadError;

  const rowCounts = Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, tables[table].length])
  ) as Record<BackupTable, number>;

  return { path, rowCounts };
}
