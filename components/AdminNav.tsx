import Link from "next/link";

const linkStyle: React.CSSProperties = { color: "#333", textDecoration: "none" };

// Persistent top bar for every /admin/* and /vendor/* dashboard page, so
// there's always a way back to Home/all-stalls without hitting the browser
// back button. Vendors only see their own stall + Vendor Mode -- the
// admin-only links below 403/redirect a vendor session anyway (see
// middleware.ts), so there's no point showing them. restricted_admin sees
// the same view links as admin (it can view every stall/order/dashboard --
// see lib/session-role.ts) but not "Add vendor" or "Add restricted admin",
// since it can't create either -- those routes reject it server-side
// regardless (app/admin/vendors/create/route.ts,
// app/admin/staff/create/route.ts), this just keeps a dead link off its nav.
export default function AdminNav({ role }: { role: "admin" | "restricted_admin" | "vendor" }) {
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        padding: "10px 24px",
        borderBottom: "1px solid #ddd",
        background: "#fafafa",
        fontSize: 13,
      }}
    >
      <Link href="/" style={{ ...linkStyle, fontWeight: 600 }}>
        &larr; Art Kade Home
      </Link>
      <Link href="/vendor" style={linkStyle}>
        Stall dashboard
      </Link>
      {(role === "admin" || role === "restricted_admin") && (
        <>
          <Link href="/admin" style={linkStyle}>
            All stalls
          </Link>
          <Link href="/admin/orders" style={linkStyle}>
            Orders
          </Link>
          <Link href="/admin/magazine" style={linkStyle}>
            Magazine
          </Link>
          <Link href="/admin/beta-signups" style={linkStyle}>
            Beta signups
          </Link>
        </>
      )}
      {role === "admin" && (
        <>
          <Link href="/admin/vendors/new" style={linkStyle}>
            Add vendor
          </Link>
          <Link href="/admin/staff/new" style={linkStyle}>
            Add restricted admin
          </Link>
        </>
      )}
    </nav>
  );
}
