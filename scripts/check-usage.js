#!/usr/bin/env node
// Free-tier health check -- see docs/free-tier-checklist.md for when/why to
// run this. Self-contained (parses .env.local itself) so it works with a
// plain `node scripts/check-usage.js`, no extra flags or dependencies
// beyond what's already in package.json.
//
// Checks everything reachable through the Data API + a small one-time RPC
// (see supabase/schema.sql's get_db_stats -- PostgREST doesn't expose
// pg_database_size() itself, only tables/views). Cached Egress and Egress
// -- the two figures that actually gate the Free plan -- have no API at
// all, Management or otherwise (confirmed against api.supabase.com's own
// OpenAPI spec while building this); this script prints the exact
// dashboard URL and the numbers to compare against instead of pretending
// to automate what isn't automatable.

const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const FREE_TIER_LIMITS = {
  cachedEgressBytes: 5 * 1024 * 1024 * 1024, // 5 GB/month -- dashboard-only, see below
  databaseBytes: 500 * 1024 * 1024, // 500 MB
  storageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
  monthlyActiveUsers: 50000,
};

// >90% is CRITICAL (one bad day from tipping over), >70% is a WARNing
// worth planning around, otherwise OK. Same bands for every metric so the
// report reads consistently.
function status(used, limit) {
  const pct = (used / limit) * 100;
  if (pct >= 90) return { level: "CRITICAL", pct };
  if (pct >= 70) return { level: "WARN", pct };
  return { level: "OK", pct };
}

function fmtBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function fmtCount(n) {
  return n.toLocaleString("en-US");
}

function printLine(label, used, limit, extra = "", fmt = fmtBytes) {
  const { level, pct } = status(used, limit);
  const marker = level === "CRITICAL" ? "🔴" : level === "WARN" ? "🟡" : "🟢";
  console.log(
    `${marker} ${level.padEnd(8)} ${label.padEnd(28)} ${fmt(used).padStart(10)} / ${fmt(limit).padEnd(10)} (${pct.toFixed(1)}%)${extra}`
  );
}

async function listAllObjects(supabase, bucket, dirPath = "") {
  let all = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(dirPath, { limit, offset });
    if (error) throw new Error(`listing ${bucket}/${dirPath}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = dirPath ? `${dirPath}/${item.name}` : item.name;
      if (item.id === null) {
        // no id/metadata = a "folder" marker, not a real object -- recurse
        all = all.concat(await listAllObjects(supabase, bucket, fullPath));
      } else {
        all.push({ path: fullPath, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function main() {
  const env = loadEnv();
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

  console.log("=".repeat(80));
  console.log("SUPABASE FREE-TIER HEALTH CHECK");
  console.log(`Project: ${projectRef}   Run at: ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  let anyCritical = false;

  // --- Database size (needs supabase/schema.sql's get_db_stats -- see
  // docs/free-tier-checklist.md if this errors with "could not find
  // function": the one-time SQL hasn't been run yet). ---
  const { data: dbStats, error: dbError } = await supabase.rpc("get_db_stats");
  if (dbError) {
    console.log(`🔴 CRITICAL Database size check failed: ${dbError.message}`);
    console.log("   -> Has the get_db_stats() function from supabase/schema.sql been created yet?");
    console.log("   -> See docs/free-tier-checklist.md's one-time setup section.");
    anyCritical = true;
  } else {
    const row = dbStats[0];
    printLine("Database size", Number(row.database_size_bytes), FREE_TIER_LIMITS.databaseBytes, `  (${row.public_table_count} public tables)`);
    if (status(Number(row.database_size_bytes), FREE_TIER_LIMITS.databaseBytes).level === "CRITICAL") anyCritical = true;
  }

  // --- Storage size, with a per-bucket breakdown ---
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.log(`🔴 CRITICAL Storage check failed: ${bucketsError.message}`);
    anyCritical = true;
  } else {
    let totalStorageBytes = 0;
    const perBucket = [];
    for (const bucket of buckets) {
      const objects = await listAllObjects(supabase, bucket.id);
      const bucketBytes = objects.reduce((sum, o) => sum + o.size, 0);
      totalStorageBytes += bucketBytes;
      perBucket.push({ name: bucket.id, bytes: bucketBytes, count: objects.length });
    }
    printLine("Storage (all buckets)", totalStorageBytes, FREE_TIER_LIMITS.storageBytes);
    for (const b of perBucket.sort((a, b) => b.bytes - a.bytes)) {
      console.log(`   - ${b.name.padEnd(20)} ${fmtBytes(b.bytes).padStart(10)}  (${b.count} objects)`);
    }
    if (status(totalStorageBytes, FREE_TIER_LIMITS.storageBytes).level === "CRITICAL") anyCritical = true;
  }

  // --- Auth users (a lower bound, not the real MAU figure -- see note below) ---
  let totalUsers = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.log(`🟡 WARN     Could not list auth users: ${error.message}`);
      break;
    }
    totalUsers += data.users.length;
    if (data.users.length < 1000) break;
  }
  printLine(
    "Total auth users",
    totalUsers,
    FREE_TIER_LIMITS.monthlyActiveUsers,
    "  (lower bound for MAU, see note below)",
    fmtCount
  );

  console.log("-".repeat(80));
  console.log("NOT CHECKABLE VIA API -- CHECK MANUALLY EVERY SESSION:");
  console.log(`  Cached Egress (5 GB/month limit) and Egress -- these are what actually`);
  console.log(`  gate the Free plan and there is no Management API endpoint for either`);
  console.log(`  (confirmed against api.supabase.com's OpenAPI spec: only billing/addons`);
  console.log(`  endpoints exist, nothing for usage metrics). Open this exact URL`);
  console.log(`  (redirects to the org-scoped usage page automatically):`);
  console.log(`\n  https://supabase.com/dashboard/project/${projectRef}/settings/billing/usage\n`);
  console.log(`  Read "Cached Egress" and "Egress" under Usage Summary. If Cached Egress`);
  console.log(`  is past 4 GB (80%), treat it exactly like a CRITICAL line above.`);
  console.log(`  Also glance at "Monthly Active Users" there -- it's the real figure,`);
  console.log(`  the auth-user count above is only ever a floor under it.`);
  console.log("=".repeat(80));

  if (anyCritical) {
    console.log("\nRESULT: at least one automatically-checked metric is CRITICAL. See above.");
    process.exitCode = 1;
  } else {
    console.log("\nRESULT: all automatically-checked metrics are within bounds.");
    console.log("Cached Egress/Egress still need the manual check above before you call this clean.");
  }
}

main().catch((err) => {
  console.error("check-usage.js failed:", err);
  process.exitCode = 1;
});
