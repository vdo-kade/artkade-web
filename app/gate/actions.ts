"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { GATE_COOKIE_NAME, getExpectedGateCookieValue } from "@/lib/gate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

// The only place SITE_GATE_PASSWORD is ever compared -- entirely
// server-side, never sent to or checked by the client. formData's
// "password" value never touches a cookie or gets echoed back on failure.
export async function enterGate(formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  if (typeof password !== "string" || !password) {
    return { ok: false, error: "Enter the password." };
  }

  // Rate-limited before the comparison even happens -- a single password
  // to guard, so the real risk is a script brute-forcing it, not a normal
  // user mistyping a few times.
  const ip = await getClientIp();
  if (!checkRateLimit(`gate:${ip}`, 10, 10 * 60 * 1000)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const expected = process.env.SITE_GATE_PASSWORD;
  if (!expected) {
    console.error("SITE_GATE_PASSWORD is not set -- refusing to open the gate.");
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  if (password !== expected) {
    return { ok: false, error: "Wrong password. Try again." };
  }

  const cookieValue = await getExpectedGateCookieValue();
  if (!cookieValue) {
    console.error("Failed to compute gate cookie value.");
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  const cookieStore = await cookies();
  cookieStore.set(GATE_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days -- a "come back later" gate, not a one-time token
  });

  redirect("/");
}

// Separate lead-capture path, not a password bypass -- this never touches
// the gate cookie. Uses the service-role client, not the anon one: this is
// a Server Action (server-only, the key never reaches the browser), and an
// unresolved anon-role RLS insert issue was found affecting this project
// at the Postgres level during testing (parked separately, tracked outside
// this feature -- live checkout was independently confirmed still working
// end to end despite it). Routing this specific write through service-role
// sidesteps that open question entirely rather than depending on it.
export async function submitBetaSignup(formData: FormData): Promise<ActionState> {
  // Honeypot: a field real visitors never see or fill (styled off-screen
  // in the form), so anything non-empty here is a bot filling every field
  // it finds. Report success without writing anything, so the bot has no
  // signal to adapt against.
  if (typeof formData.get("company") === "string" && formData.get("company") !== "") {
    return { ok: true };
  }

  const email = formData.get("email");
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email." };
  }

  const ip = await getClientIp();
  if (!checkRateLimit(`beta-signup:${ip}`, 5, 60 * 60 * 1000)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("beta_signups").insert({ email: email.trim() });
  if (error) {
    console.error("Failed to record beta signup:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  return { ok: true };
}
