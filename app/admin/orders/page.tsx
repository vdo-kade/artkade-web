import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCachedUser } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";
import { ActionForm } from "@/components/ActionForm";
import { approveOrder, rejectOrder } from "./actions";
import { logout } from "../actions";

export const revalidate = 0;

const ORDER_SELECT = `id, order_number, customer_name, customer_email, customer_phone, shipping_address,
  total_amount, payment_proof_url, customer_notes, status, reviewed_at, created_at,
  order_items ( id, quantity, unit_price, sticker_pack_selection, products ( name ), product_variants ( label ) )`;

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
  status: string;
  reviewed_at: string | null;
  created_at: string;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    sticker_pack_selection: { id: string; name: string }[] | null;
    products: { name: string } | null;
    product_variants: { label: string } | null;
  }[];
};

type OrderWithProof = OrderRow & { proofUrl: string | null };

// Never render a raw error/exception message in this page's JSX -- it's a
// Server Component, so anything here becomes part of the HTML sent to the
// browser. Internal client-library errors (e.g. a malformed key breaking
// header construction) can embed sensitive values like the service role
// key in their message. Log full detail server-side only; the page only
// ever shows a fixed, safe string.
function AdminOrdersError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load orders. Check the server logs for details.</p>
    </div>
  );
}

async function withSignedProofs(
  supabase: ReturnType<typeof createAdminClient>,
  orders: OrderRow[]
): Promise<OrderWithProof[]> {
  return Promise.all(
    orders.map(async (order) => {
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
}

function ProofPreview({ order }: { order: OrderWithProof }) {
  if (!order.proofUrl) return <p>No payment proof uploaded.</p>;
  const isPdf = order.payment_proof_url?.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return (
      <a href={order.proofUrl} target="_blank" rel="noopener noreferrer">
        View payment proof (PDF)
      </a>
    );
  }
  return (
    <a href={order.proofUrl} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={order.proofUrl}
        alt="Payment proof"
        style={{ maxWidth: 200, maxHeight: 200, border: "1px solid #ccc" }}
      />
    </a>
  );
}

function ItemsTable({ items }: { items: OrderRow["order_items"] }) {
  return (
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
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              {item.products?.name ?? "(deleted product)"}
              {item.sticker_pack_selection && item.sticker_pack_selection.length > 0 && (
                <div style={{ fontSize: 12, color: "#666" }}>
                  Designs: {item.sticker_pack_selection.map((d) => d.name).join(", ")}
                </div>
              )}
            </td>
            <td>{item.product_variants?.label ?? "-"}</td>
            <td>{item.quantity}</td>
            <td>Rs. {item.unit_price.toLocaleString("en-US")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: "green",
  rejected: "#b00",
};

export default async function AdminOrdersPage() {
  // Was missing entirely -- every other admin/vendor page re-derives the
  // caller's role and bounces a dead/wrong-role session to login rather
  // than relying solely on middleware. See app/admin/orders/actions.ts for
  // why the actions need this same check.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <AdminOrdersError />;
  }

  // Same cached call getSessionRole() above already made -- see
  // getCachedUser() in lib/supabase-server.ts.
  const {
    data: { user },
  } = await getCachedUser();

  const [pendingResult, reviewedResult] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("status", "awaiting_review")
      .order("created_at", { ascending: true })
      .returns<OrderRow[]>(),
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(20)
      .returns<OrderRow[]>(),
  ]);

  if (pendingResult.error) {
    console.error("Failed to load pending orders:", pendingResult.error);
    return <AdminOrdersError />;
  }
  if (reviewedResult.error) {
    console.error("Failed to load reviewed orders:", reviewedResult.error);
    return <AdminOrdersError />;
  }

  const pending = await withSignedProofs(supabase, pendingResult.data ?? []);
  const reviewed = await withSignedProofs(supabase, reviewedResult.data ?? []);

  return (
    <>
      <AdminNav role="admin" />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24 }}>Orders awaiting review</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#666" }}>
          {user?.email && <span>{user.email}</span>}
          <form action={logout}>
            <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }}>
              Log out
            </button>
          </form>
        </div>
      </div>
      <p style={{ color: "#666", marginBottom: 24 }}>
        {pending.length} order{pending.length === 1 ? "" : "s"} pending.
      </p>

      {pending.length === 0 && <p>Nothing to review.</p>}

      {pending.map((order) => (
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

          <ItemsTable items={order.order_items} />

          <p>
            <strong>Total: Rs. {order.total_amount.toLocaleString("en-US")}</strong>
          </p>

          <div style={{ margin: "12px 0" }}>
            <ProofPreview order={order} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <ActionForm action={approveOrder} successMessage="Approved.">
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                style={{ background: "green", color: "white", padding: "6px 12px", border: "none" }}
              >
                Approve
              </button>
            </ActionForm>
            <ActionForm action={rejectOrder} successMessage="Rejected.">
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                style={{ background: "#b00", color: "white", padding: "6px 12px", border: "none" }}
              >
                Reject
              </button>
            </ActionForm>
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 20, marginTop: 40, marginBottom: 8 }}>Recently reviewed</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Last {reviewed.length} approved/rejected order{reviewed.length === 1 ? "" : "s"}, most
        recent first. Read-only.
      </p>

      {reviewed.length === 0 && <p>Nothing reviewed yet.</p>}

      {reviewed.map((order) => (
        <div
          key={order.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 16,
            marginBottom: 12,
            opacity: 0.85,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{order.order_number}</strong>
            <span
              style={{
                color: STATUS_COLORS[order.status] ?? "#666",
                textTransform: "uppercase",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {order.status}
              {order.reviewed_at ? ` · ${new Date(order.reviewed_at).toLocaleString()}` : ""}
            </span>
          </div>

          <p>
            <strong>{order.customer_name}</strong> — {order.customer_email}
          </p>

          <ItemsTable items={order.order_items} />

          <p>
            <strong>Total: Rs. {order.total_amount.toLocaleString("en-US")}</strong>
          </p>

          <div style={{ margin: "12px 0" }}>
            <ProofPreview order={order} />
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
