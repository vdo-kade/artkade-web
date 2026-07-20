import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";

// Excluded from middleware's site/role gates (see middleware.ts's matcher
// comment about /api/*), but this isn't under /api -- it's a plain route
// handler under /admin, so middleware's own /admin role gate already covers
// it. This check is the same defense-in-depth every Server Action in this
// app also does independently of the page-level gate.
export async function GET() {
  const session = await getSessionRole();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("beta_signups")
    .select("email, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load beta signups for export:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const rows: string[][] = [["email", "signed_up_at"], ...(data ?? []).map((s) => [s.email, s.created_at])];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beta-signups-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  // Standard CSV/formula-injection mitigation: a cell starting with =, +,
  // -, or @ can be interpreted as a formula by Excel/Sheets/etc when this
  // file is opened -- email is free-text from the public gate form (see
  // app/gate/actions.ts's submitBetaSignup), so nothing stops one from
  // starting with any of those. Prefixing with a single quote forces it to
  // be read as literal text, same as typing a leading apostrophe directly
  // into a spreadsheet cell. This runs before the existing comma/quote/
  // newline quoting below, which is a separate concern (CSV field parsing,
  // not formula execution) and still needs to apply to the result.
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}
