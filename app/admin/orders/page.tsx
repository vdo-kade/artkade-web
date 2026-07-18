import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCachedUser } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";
import { ActionForm } from "@/components/ActionForm";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, NEXT_STATUSES } from "@/lib/orders";
import {
  approveOrder,
  rejectOrder,
  markShipped,
  markDelivered,
  markCancelled,
  markOutOfStock,
  updateInternalNotes,
} from "./actions";
import { logout } from "../actions";
import type { ActionState } from "@/lib/action-state";

export const revalidate = 0;

const ORDER_SELECT = `id, order_number, customer_name, customer_email, customer_phone, shipping_address,
  total_amount, payment_proof_url, customer_notes, internal_notes, status, reviewed_at, reviewed_by, created_at,
  order_items ( id, quantity, unit_price, products ( name ), product_variants ( label ) ),
  order_status_history ( status, note, created_at )`;

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
  internal_notes: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    products: { name: string } | null;
    product_variants: { label: string } | null;
  }[];
  order_status_history: {
    status: string;
    note: string | null;
    created_at: string;
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
            <td>{item.products?.name ?? "(deleted product)"}</td>
            <td>{item.product_variants?.label ?? "-"}</td>
            <td>{item.quantity}</td>
            <td>Rs. {item.unit_price.toLocaleString("en-US")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// order_status_history was write-only until now -- every transition
// inserts a row (see ./actions.ts's transitionOrderStatus) but nothing
// ever rendered them back. Sorted client-side rather than via the select
// string: Supabase's nested-resource syntax doesn't support ordering a
// joined table independently of the top-level query's own .order().
function StatusHistory({ history }: { history: OrderRow["order_status_history"] }) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #ddd" }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 6 }}>
        History
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "#666" }}>
        {sorted.map((h, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            <strong style={{ color: ORDER_STATUS_COLORS[h.status] ?? "#666" }}>
              {ORDER_STATUS_LABELS[h.status] ?? h.status}
            </strong>{" "}
            · {new Date(h.created_at).toLocaleString()}
            {h.note ? ` · ${h.note}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InternalNotes({ order }: { order: OrderRow }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #ddd" }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 6 }}>
        Internal notes <span style={{ textTransform: "none" }}>(staff only, customer never sees this)</span>
      </p>
      <ActionForm action={updateInternalNotes} successMessage="Notes saved.">
        <input type="hidden" name="orderId" value={order.id} />
        <textarea
          name="notes"
          defaultValue={order.internal_notes ?? ""}
          rows={2}
          style={{ display: "block", width: "100%", padding: 6, fontSize: 13, boxSizing: "border-box", marginBottom: 6 }}
        />
        <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
          Save notes
        </button>
      </ActionForm>
    </div>
  );
}

const NEXT_STATUS_ACTIONS: Record<string, { action: (formData: FormData) => Promise<ActionState>; label: string; color: string }> = {
  shipped: { action: markShipped, label: "Mark shipped", color: "#0a6dab" },
  delivered: { action: markDelivered, label: "Mark delivered", color: "#1a7f37" },
  cancelled: { action: markCancelled, label: "Cancel order", color: "#999" },
  out_of_stock: { action: markOutOfStock, label: "Mark out of stock", color: "#b00" },
};

// Renders whichever "next status" buttons apply to this order's current
// status (see lib/orders.ts's NEXT_STATUSES) -- nothing renders for a
// terminal status (rejected, delivered, cancelled, out_of_stock).
function FulfillmentActions({ order }: { order: OrderRow }) {
  const nextStatuses = NEXT_STATUSES[order.status];
  if (!nextStatuses || nextStatuses.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {nextStatuses.map((status) => {
        const cfg = NEXT_STATUS_ACTIONS[status];
        if (!cfg) return null;
        return (
          <ActionForm key={status} action={cfg.action} successMessage={`${ORDER_STATUS_LABELS[status]}.`}>
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              style={{ background: cfg.color, color: "white", padding: "6px 12px", border: "none" }}
            >
              {cfg.label}
            </button>
          </ActionForm>
        );
      })}
    </div>
  );
}

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
    // Every status past awaiting_review, not just approved/rejected --
    // this bucket used to be purely "recently reviewed, read-only" but now
    // also carries the rest of the fulfillment lifecycle (shipped,
    // delivered, etc), so an approved/shipped order here still gets its
    // FulfillmentActions buttons; only a genuinely terminal status
    // (rejected, delivered, cancelled, out_of_stock) is inert.
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .neq("status", "awaiting_review")
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

          <StatusHistory history={order.order_status_history} />
          <InternalNotes order={order} />
        </div>
      ))}

      <h2 style={{ fontSize: 20, marginTop: 40, marginBottom: 8 }}>Reviewed &amp; in progress</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Last {reviewed.length} order{reviewed.length === 1 ? "" : "s"} past review, most recent
        first. An approved or shipped order can still be moved forward below; rejected/delivered/
        cancelled/out-of-stock orders are final.
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{order.order_number}</strong>
            <span
              style={{
                color: ORDER_STATUS_COLORS[order.status] ?? "#666",
                textTransform: "uppercase",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
              {order.reviewed_at ? ` · ${new Date(order.reviewed_at).toLocaleString()}` : ""}
            </span>
          </div>
          {order.reviewed_by && (
            <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>Reviewed by {order.reviewed_by}</p>
          )}

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

          <FulfillmentActions order={order} />
          <StatusHistory history={order.order_status_history} />
          <InternalNotes order={order} />
        </div>
      ))}
      </div>
    </>
  );
}
