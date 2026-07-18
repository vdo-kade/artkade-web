// Shared between the God dashboard's order-review page and the vendor
// dashboard's Tracker tab, same pattern as CATEGORY_LABELS in
// lib/catalogue.ts.

export const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  out_of_stock: "Out of stock",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  awaiting_review: "#a06a00",
  approved: "green",
  rejected: "#b00",
  out_of_stock: "#b00",
  shipped: "#0a6dab",
  delivered: "#1a7f37",
  cancelled: "#999",
};

// Which statuses an order in a given status can move to next from the God
// dashboard's order-review page. Deliberately flat/simple (any admin
// action is a one-step transition, not a strict workflow engine) rather
// than a full state machine -- approve/reject stay their own dedicated
// actions (see app/admin/orders/actions.ts) since they also stamp
// reviewed_by/reviewed_at; every status below is pure fulfillment
// tracking, no reviewer stamp. Statuses with no entry here (rejected,
// out_of_stock, delivered, cancelled) are terminal in this UI.
export const NEXT_STATUSES: Record<string, string[]> = {
  approved: ["shipped", "out_of_stock", "cancelled"],
  shipped: ["delivered", "cancelled"],
};
