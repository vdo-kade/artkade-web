import Link from "next/link";

const linkStyle: React.CSSProperties = { color: "#333", textDecoration: "none" };

// Persistent top bar for every /admin/* and /vendor/* dashboard page, so
// there's always a way back to Home/all-stalls without hitting the browser
// back button. Vendors only see their own stall + Vendor Mode -- the
// admin-only links below 403/redirect a vendor session anyway (see
// middleware.ts), so there's no point showing them.
export default function AdminNav({ role }: { role: "admin" | "vendor" }) {
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
      {role === "admin" && (
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
          <Link href="/admin/vendors/new" style={linkStyle}>
            Add vendor
          </Link>
        </>
      )}
    </nav>
  );
}
