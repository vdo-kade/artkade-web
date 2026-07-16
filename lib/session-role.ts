import { getCachedUser } from "./supabase-server";

// A user's role/artist link lives entirely in Supabase Auth's
// app_metadata (the same place the original single admin flag lived --
// see middleware.ts) rather than a separate profiles table:
//   admin:  { role: "admin" }
//   vendor: { role: "vendor", artist_id: "<uuid of their artists row>" }
// Set via the Auth Admin API when an account is created (see README).
export type SessionRole = { role: "admin" } | { role: "vendor"; artistId: string };

// Re-derives the caller's role from their session on every call rather
// than trusting anything the client submits -- Server Actions are POST
// endpoints in their own right, so each one needs its own authorization
// check, not just the page that renders their trigger form.
export async function getSessionRole(): Promise<SessionRole | null> {
  const {
    data: { user },
  } = await getCachedUser();

  const role = user?.app_metadata?.role;
  if (role === "admin") return { role: "admin" };
  if (role === "vendor" && typeof user?.app_metadata?.artist_id === "string") {
    return { role: "vendor", artistId: user.app_metadata.artist_id };
  }
  return null;
}
