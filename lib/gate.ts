// Shared between middleware.ts (Edge runtime) and app/gate/actions.ts
// (Node runtime, via a Server Action) -- both need the exact same cookie
// name/path and the same hash of SITE_GATE_PASSWORD, so this lives in one
// place rather than being duplicated per-runtime. Web Crypto's
// crypto.subtle is available as a global in both runtimes (unlike Node's
// `crypto` module, which Edge can't bundle), so sha256Hex works unchanged
// in either file.
export const GATE_COOKIE_NAME = "artkade_gate";
export const GATE_PATH = "/gate";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// The cookie stores a hash of the password, not the password itself --
// even though it's httpOnly (so page JS can't read it), this keeps the
// real secret out of the cookie entirely in case it ever leaks via logs,
// a proxy, or browser devtools' cookie inspector.
export async function getExpectedGateCookieValue(): Promise<string | null> {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}
