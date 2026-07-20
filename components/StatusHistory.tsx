import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/orders";

export type StatusHistoryEntry = { status: string; note: string | null; created_at: string };

// order_status_history was write-only until it was first wired up -- every
// transition inserts a row (see app/admin/orders/actions.ts's
// transitionOrderStatus) but nothing rendered them back. Shared between the
// God dashboard's order-review page and the vendor Tracker, rather than two
// copies of the same rendering. Sorted client-side rather than via the
// select string: Supabase's nested-resource syntax doesn't support ordering
// a joined table independently of the top-level query's own .order().
export default function StatusHistory({ history }: { history: StatusHistoryEntry[] }) {
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
