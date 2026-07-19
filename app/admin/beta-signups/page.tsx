import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";

export const revalidate = 0;

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

type SignupRow = { id: string; email: string; created_at: string };

// Same never-render-a-raw-error pattern as every other admin page (see
// app/admin/page.tsx's GodDashboardError).
function GodBetaSignupsError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load beta signups. Check the server logs for details.</p>
    </div>
  );
}

export default async function AdminBetaSignupsPage() {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <GodBetaSignupsError />;
  }

  const { data, error } = await supabase
    .from("beta_signups")
    .select("id, email, created_at")
    .order("created_at", { ascending: false })
    .returns<SignupRow[]>();

  if (error) {
    console.error("Failed to load beta signups:", error);
    return <GodBetaSignupsError />;
  }

  const signups = data ?? [];

  return (
    <>
      <AdminNav role="admin" />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h1 style={{ fontSize: 24 }}>Beta signups</h1>
          <a
            href="/admin/beta-signups/export"
            style={{ padding: "6px 14px", background: "#333", color: "#fff", textDecoration: "none", fontSize: 13 }}
          >
            Export CSV
          </a>
        </div>

        <div style={card}>
          {signups.length === 0 && <p>No signups yet.</p>}
          {signups.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: "4px 8px 8px 0" }}>Email</th>
                  <th style={{ padding: "4px 0 8px" }}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 8px 6px 0" }}>{s.email}</td>
                    <td style={{ padding: "6px 0", color: "#666", fontSize: 13 }}>
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#666" }}>{signups.length} total.</p>
      </div>
    </>
  );
}
