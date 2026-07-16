import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";
import NewVendorForm from "./NewVendorForm";

export default async function NewPopUpVendorPage() {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  return (
    <>
      <AdminNav role="admin" />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 560, margin: "0 auto" }}>
        <p style={{ marginBottom: 16 }}>
          <Link href="/admin">&larr; Back to dashboard</Link>
        </p>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Add pop-up vendor</h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
          Creates an empty stall (same structure as every other stall: print rack, sticker box,
          variants, stock tracking) plus a login the vendor can use to manage it themselves.
        </p>
        <NewVendorForm />
      </div>
    </>
  );
}
