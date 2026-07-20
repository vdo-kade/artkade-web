// Shared weight/shipping logic -- used at variant creation (default
// weight_grams), at checkout (order total weight, bulk flag, shipping
// method, all snapshotted onto the order the same way unit_price already
// is, so a later catalogue edit can't silently rewrite a past order's
// shipping classification), and in the Tracker's ship-by grouping.

export type ShippingMethod = "registered_post" | "courier";

export const BULK_THRESHOLD_GRAMS = 1000;

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  registered_post: "Registered Post",
  courier: "Courier",
};

// Confirmed defaults by category/size. Applied both to the one-time
// backfill of existing variants and going forward whenever a vendor adds
// or edits a variant (see app/vendor/actions.ts) -- so this can't quietly
// regress to null weights the way sort_order once regressed to 0 (see the
// earlier sort_order backfill task). Returns null for anything not
// physically shipped (digital/freebie) or an unrecognized print size,
// rather than guessing.
export function defaultWeightGrams(category: string, label: string): number | null {
  if (category === "sticker_pack") return 5;
  if (category === "tshirt") return 200;
  if (category === "print") {
    const l = label.toUpperCase();
    if (/\bA6\b/.test(l) || /\bA5\b/.test(l)) return 15;
    if (/\bA4\b/.test(l)) return 40;
    if (/\bA3\b/.test(l)) return 80;
    if (/\bA2\b/.test(l) || /\bA1\b/.test(l)) return 250;
    return null;
  }
  return null; // digital/freebie/other -- not physically shipped
}

export type ShippableItem = {
  category: string;
  label: string;
  quantity: number;
  weightGrams: number | null;
};

export function computeTotalWeightGrams(items: ShippableItem[]): number {
  return items.reduce((sum, item) => sum + (item.weightGrams ?? 0) * item.quantity, 0);
}

export function isBulkOrder(totalWeightGrams: number): boolean {
  return totalWeightGrams > BULK_THRESHOLD_GRAMS;
}

// Registered Post only for stickers + small prints (A6/A5/A4); A3/A2/A1
// prints, t-shirts, and anything else disqualify the whole order to
// courier regardless of what else is in it -- confirmed shipping logic.
// Digital/freebie items carry no physical shipping burden either way, so
// they're excluded from the check rather than treated as disqualifying.
function isRegisteredPostEligibleItem(item: ShippableItem): boolean {
  if (item.category === "digital" || item.category === "freebie") return true;
  if (item.category === "sticker_pack") return true;
  if (item.category === "print") {
    const l = item.label.toUpperCase();
    if (/\bA3\b/.test(l) || /\bA2\b/.test(l) || /\bA1\b/.test(l)) return false;
    return true;
  }
  return false; // tshirt/other
}

export function determineShippingMethod(items: ShippableItem[], totalWeightGrams: number): ShippingMethod {
  if (totalWeightGrams > BULK_THRESHOLD_GRAMS) return "courier";
  return items.every(isRegisteredPostEligibleItem) ? "registered_post" : "courier";
}

// The recurring weekly cycle: orders that land by Friday get packaged over
// the weekend and go out with Monday's Registered Post run. An order
// evaluated on a Saturday or Sunday has already missed that week's
// cutoff (it passed yesterday or before), so it rolls to the *following*
// Friday/Monday, not the immediately upcoming one.
export function nextFridayCutoff(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilFriday = (5 - day + 7) % 7; // 0 if `from` is itself a Friday
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

export function shipMondayFor(fridayCutoff: Date): Date {
  const d = new Date(fridayCutoff);
  d.setDate(d.getDate() + 3);
  return d;
}

export function registeredPostShipDate(from: Date = new Date()): Date {
  return shipMondayFor(nextFridayCutoff(from));
}

export function formatShipDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
