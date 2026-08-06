"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

// The account this protects (admin, plus every vendor's dashboard) holds
// real business data, so it's worth a scripted attacker's time -- gets a
// per-IP rate limit rather than relying on whatever Supabase Auth's own
// default throttling happens to allow. Moving the sign-in call itself
// server-side (rather than the client SDK calling Supabase directly, as
// this page used to) is what makes that check enforceable at all: it runs
// before Supabase Auth ever sees the attempt.
export async function signIn(email: string, password: string): Promise<ActionState> {
  if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const ip = await getClientIp();
  if (!checkRateLimit(`admin-login:${ip}`, 10, 10 * 60 * 1000)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Invalid email or password." };
  }

  // Vendors and admin share this one login page (see middleware.ts) --
  // where sign-in lands next depends on which role comes back in
  // app_metadata, same as the destinationFor logic this replaces.
  redirect(data.user.app_metadata?.role === "vendor" ? "/vendor" : "/admin");
}
