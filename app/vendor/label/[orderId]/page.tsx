import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import PrintButton from "./PrintButton";

export const revalidate = 0;

type OrderItemRow = {
  products: { artist_id: string; name: string } | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  order_items: OrderItemRow[];
};

// Fulfillment is centralized (Varsha packs and posts everything herself
// regardless of which stall the order came from), so the return address is
// one fixed value on every label -- not per-stall data, and not something
// that belongs on the artists table.
const RETURN_ADDRESS = {
  name: "Varsha Dilan / Art Kade",
  lines: ["19/2 Pepiliyana Mawatha", "Kohuwala, Colombo"],
};

// Printable Sri Lanka Post-style parcel label: FROM (fixed return address) /
// TO (customer) / order number as the parcel reference.
export default async function ShippingLabelPage({ params }: { params: { orderId: string } }) {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, shipping_address, order_items(products(artist_id, name))"
    )
    .eq("id", params.orderId)
    .maybeSingle<OrderRow>();

  if (!order) notFound();

  const itemsForThisVendor =
    session.role === "vendor"
      ? order.order_items.filter((oi) => oi.products?.artist_id === session.artistId)
      : order.order_items;

  if (session.role === "vendor" && itemsForThisVendor.length === 0) notFound();

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <PrintButton />

      <div
        className="label"
        style={{
          border: "2px solid #111",
          padding: 20,
          fontSize: 14,
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>
          From
        </p>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{RETURN_ADDRESS.name}</p>
        {RETURN_ADDRESS.lines.map((line) => (
          <p key={line} style={{ marginBottom: 4 }}>
            {line}
          </p>
        ))}
        <div style={{ marginBottom: 16 }} />

        <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>
          To
        </p>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{order.customer_name}</p>
        <p style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>{order.shipping_address}</p>
        <p style={{ marginBottom: 16 }}>Tel: {order.customer_phone}</p>

        <div style={{ borderTop: "1px dashed #999", paddingTop: 12 }}>
          <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>
            Reference
          </p>
          <p style={{ fontFamily: "monospace", fontSize: 18 }}>{order.order_number}</p>
        </div>
      </div>

      <style>{`
        @media print {
          .print-hide { display: none; }
          @page { size: 100mm 150mm; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}
