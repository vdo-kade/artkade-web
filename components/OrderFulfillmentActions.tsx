import { ActionForm } from "./ActionForm";
import { ORDER_STATUS_LABELS, NEXT_STATUSES } from "@/lib/orders";
import { markShipped, markDelivered, markCancelled, markOutOfStock } from "@/app/admin/orders/actions";
import type { ActionState } from "@/lib/action-state";

const NEXT_STATUS_ACTIONS: Record<string, { action: (formData: FormData) => Promise<ActionState>; label: string; color: string }> = {
  shipped: { action: markShipped, label: "Mark shipped", color: "#0a6dab" },
  delivered: { action: markDelivered, label: "Mark delivered", color: "#1a7f37" },
  cancelled: { action: markCancelled, label: "Cancel order", color: "#999" },
  out_of_stock: { action: markOutOfStock, label: "Mark out of stock", color: "#b00" },
};

// Shared between the God dashboard's order-review page and the vendor
// Tracker -- both call the exact same actions (app/admin/orders/actions.ts),
// which independently re-derive and enforce who's actually allowed to act
// on a given order (admin unscoped, vendor only if they own every item in
// it). This component only decides *which* buttons to show for a status
// (see lib/orders.ts's NEXT_STATUSES); it does no authorization itself.
export default function OrderFulfillmentActions({ orderId, status }: { orderId: string; status: string }) {
  const nextStatuses = NEXT_STATUSES[status];
  if (!nextStatuses || nextStatuses.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {nextStatuses.map((s) => {
        const cfg = NEXT_STATUS_ACTIONS[s];
        if (!cfg) return null;
        return (
          <ActionForm key={s} action={cfg.action} successMessage={`${ORDER_STATUS_LABELS[s]}.`}>
            <input type="hidden" name="orderId" value={orderId} />
            <button type="submit" style={{ background: cfg.color, color: "white", padding: "6px 12px", border: "none" }}>
              {cfg.label}
            </button>
          </ActionForm>
        );
      })}
    </div>
  );
}
