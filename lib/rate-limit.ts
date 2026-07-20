import { headers } from "next/headers";

// In-memory, per-instance rate limiter -- this project has no Redis/KV
// provisioned, so this is a basic deterrent against casual scripted abuse
// (gate password guessing, checkout/signup spam), not a hard guarantee
// under distributed load: it resets on cold start and isn't shared across
// concurrent serverless instances. Good enough to stop a simple script
// hammering one endpoint, which is the actual threat being defended
// against here.
const buckets = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Only sweep once the map has grown enough to matter -- avoids paying
  // the full-scan cost on every single call.
  if (buckets.size > 5000) prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Vercel sets x-forwarded-for on every request; not spoofable by the
// client since Vercel's edge network overwrites it before the request
// reaches app code.
function ipFromHeaders(h: Headers): string {
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// For Server Actions, which have no request object of their own.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders(h);
}

// For Route Handlers, which already have a NextRequest with a plain
// (synchronous) Headers object -- no need for the async next/headers API.
export function getClientIpFromRequest(req: { headers: Headers }): string {
  return ipFromHeaders(req.headers);
}
