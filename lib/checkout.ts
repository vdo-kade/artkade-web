// Single source of truth for the minimum-order copy shown before checkout
// (Header's sitewide progress line, the checkout bag panel). Deliberately
// NOT imported by checkout/actions.ts -- that file keeps its own literal
// 1350 as the real, server-side enforced value, so a change here can never
// accidentally loosen the actual gate; this constant only ever drives
// display text a customer sees while shopping.
export const MIN_ORDER_TOTAL = 1350;

// Null once the bag has cleared the minimum -- callers drop the line
// entirely rather than show a "you're there!" state, per the brief: a
// quiet target to shop toward, not a running commentary.
export function minimumOrderProgressText(totalAmount: number): string | null {
  if (totalAmount >= MIN_ORDER_TOTAL) return null;
  return `Rs. ${totalAmount.toLocaleString("en-US")} of Rs. ${MIN_ORDER_TOTAL.toLocaleString("en-US")} minimum`;
}
