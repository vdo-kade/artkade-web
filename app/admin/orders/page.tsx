import { createAdminClient } from "@/lib/supabase-admin";
import { approveOrder, rejectOrder } from "./actions";

export const revalidate = 0;

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  total_amount: number;
  payment_proof_url: string | null;
  customer_notes: string | null;
  created_at: string;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    products: { name: string } | null;
    product_variants: { label: string } | null;
  }[];
};

// Never render a raw error/exception message in this page's JSX -- it's a
// Server Component, so anything here becomes part of the HTML sent to the
// browser, and this page has no login yet. Internal client-library errors
// (e.g. a malformed key breaking header construction) can embed sensitive
// values like the service role key in their message. Log full detail
// server-side only; the page only ever shows a fixed, safe string.
function AdminOrdersError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load orders. Check the server logs for details.</p>
    </div>
  );
}

export default async function AdminOrdersPage() {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <AdminOrdersError />;
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, customer_name, customer_email, customer_phone, shipping_address,
       total_amount, payment_proof_url, customer_notes, created_at,
       order_items ( id, quantity, unit_price, products ( name ), product_variants ( label ) )`
    )
    .eq("status", "awaiting_review")
    .order("created_at", { ascending: true })
    .returns<OrderRow[]>();

  if (error) {
    console.error("Failed to load orders:", error);
    return <AdminOrdersError />;
  }

  // payment_proof_url is a path in the private "payment-proofs" bucket, not
  // a public URL -- sign each one so it can be previewed here.
  const ordersWithProof = await Promise.all(
    (orders ?? []).map(async (order) => {
      let proofUrl: string | null = null;
      if (order.payment_proof_url) {
        const { data, error: signError } = await supabase.storage
          .from("payment-proofs")
          .createSignedUrl(order.payment_proof_url, 60 * 60);
        if (signError) {
          console.error("Failed to sign payment proof URL:", signError);
        }
        proofUrl = data?.signedUrl ?? null;
      }
      return { ...order, proofUrl };
    })
  );

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Orders awaiting review</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        {ordersWithProof.length} order{ordersWithProof.length === 1 ? "" : "s"} pending.
        No login on this page yet -- do not share this URL.
      </p>

      {ordersWithProof.length === 0 && <p>Nothing to review.</p>}

      {ordersWithProof.map((order) => {
        const isPdf = order.payment_proof_url?.toLowerCase().endsWith(".pdf");

        return (
          <div
            key={order.id}
            style={{ border: "1px solid #ccc", borderRadius: 6, padding: 16, marginBottom: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong>{order.order_number}</strong>
              <span>{new Date(order.created_at).toLocaleString()}</span>
            </div>

            <p>
              <strong>{order.customer_name}</strong> — {order.customer_email} —{" "}
              {order.customer_phone}
            </p>
            <p>{order.shipping_address}</p>
            {order.customer_notes && (
              <p>
                <em>Notes: {order.customer_notes}</em>
              </p>
            )}

            <table style={{ width: "100%", marginTop: 12, marginBottom: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.products?.name ?? "(deleted product)"}</td>
                    <td>{item.product_variants?.label ?? "-"}</td>
                    <td>{item.quantity}</td>
                    <td>Rs. {item.unit_price.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p>
              <strong>Total: Rs. {order.total_amount.toLocaleString("en-US")}</strong>
            </p>

            <div style={{ margin: "12px 0" }}>
              {order.proofUrl ? (
                isPdf ? (
                  <a href={order.proofUrl} target="_blank" rel="noopener noreferrer">
                    View payment proof (PDF)
                  </a>
                ) : (
                  <a href={order.proofUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.proofUrl}
                      alt="Payment proof"
                      style={{ maxWidth: 200, maxHeight: 200, border: "1px solid #ccc" }}
                    />
                  </a>
                )
              ) : (
                <p>No payment proof uploaded.</p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <form action={approveOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  style={{ background: "green", color: "white", padding: "6px 12px", border: "none" }}
                >
                  Approve
                </button>
              </form>
              <form action={rejectOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  style={{ background: "#b00", color: "white", padding: "6px 12px", border: "none" }}
                >
                  Reject
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
