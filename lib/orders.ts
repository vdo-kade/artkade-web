// Shared between the God dashboard's order-review page and the vendor
// dashboard's Tracker tab, same pattern as CATEGORY_LABELS in
// lib/catalogue.ts.

// Client-generated in app/checkout/page.tsx (ARTK- plus 6 digits), but
// re-validated everywhere it's trusted server-side -- both here as the
// single source of truth and at every call site that accepts one from a
// request (checkout's placeOrder, the payment-proof upload route), since
// it also doubles as a storage path segment and must never be passed
// through unchecked.
export const ORDER_NUMBER_PATTERN = /^ARTK-\d{6}$/;

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

export type WeekGroup<T> = { weekKey: string; weekLabel: string; orders: T[] };

const MONTH_ABBREVS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayIndex = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = (dayIndex + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

// Groups into Monday-anchored weeks, most recent week first (e.g. "Week of
// 21 Jul") -- shared by the God dashboard's order-review page and the
// vendor Tracker tab, whose order rows don't share a field name for their
// timestamp (`created_at` vs `createdAt`), hence the accessor rather than
// assuming a shape.
export function groupByWeek<T>(items: T[], getCreatedAt: (item: T) => string): WeekGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const weekStart = startOfWeek(new Date(getCreatedAt(item)));
    const key = weekStart.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, orders]) => {
      const d = new Date(key);
      return { weekKey: key, weekLabel: `Week of ${d.getDate()} ${MONTH_ABBREVS[d.getMonth()]}`, orders };
    });
}
