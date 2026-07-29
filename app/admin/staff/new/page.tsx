import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";
import NewStaffForm from "./NewStaffForm";

export default async function NewRestrictedAdminPage() {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  return (
    <>
      <AdminNav role="admin" />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 560, margin: "0 auto" }}>
        <p style={{ marginBottom: 16 }}>
          <Link href="/admin">&larr; Back to dashboard</Link>
        </p>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Add restricted admin</h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
          Creates a login with a restricted admin tier: can view every stall, product, and order, and
          can fulfil orders (approve, reject, mark shipped/delivered/cancelled), but can't add, edit, or
          delete stalls, products, or vendors.
        </p>
        <NewStaffForm />
      </div>
    </>
  );
}
