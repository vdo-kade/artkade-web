import { Resend } from "resend";
import { SITE_URL } from "./brand";

// Every value interpolated into an email's HTML body below is either
// customer-submitted (customerName) or otherwise not guaranteed safe by the
// time it reaches here (order numbers are regex-constrained before use, but
// escaping them too costs nothing and means this file never has an
// unescaped interpolation to slip up on later) -- run through this before
// it touches wrapEmailHtml's template strings. Single-pass regex + map
// rather than chained .replace calls, so earlier replacements can't get
// re-matched and double-escaped by a later one.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Lazily constructed rather than at module load -- mirrors
// createAdminClient()'s pattern of only failing when actually used, not on
// import, so a missing key doesn't crash every page that happens to import
// something from this module's call chain.
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

// artkade.space is verified in Resend, so mail goes out from a real address
// on it by default -- still overridable via env for local dev against an
// unverified Resend account, where only the shared onboarding@resend.dev
// sender works.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Art Kade <orders@artkade.space>";

// Replies land on the real inbox that already handles fulfillment (see
// app/vendor/label/[orderId]/page.tsx's RETURN_ADDRESS -- Varsha packs and
// posts every order herself), not on Resend's own shared domain, which
// nobody reads.
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO_EMAIL || "varshadilan@gmail.com";

function wrapEmailHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#F5EFE4; margin:0; padding:32px 16px; color:#1C1712;">
    <div style="max-width:480px; margin:0 auto; background:#FFFDF8; border:1px solid rgba(28,23,18,0.12); padding:32px;">
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.14em; color:#8B8175; margin:0 0 20px;">Art Kade</p>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

// Three transactional emails total: the two customer-facing ones below,
// plus the admin new-order notification further down. Everything else
// (shipped/delivered/cancelled/out_of_stock) is a fulfillment-tracking
// status with no promised email and no copy to reuse, so it stays out of
// scope here (see app/admin/orders/actions.ts).

// Reuses the homepage's own "how it works" promise (app/page.tsx's STEPS:
// "Confirmation email -- You'll get an email once it's approved" for step
// 5, "Packed and sent within the week" for step 6) rather than inventing
// new copy for what's already promised.
export async function sendOrderApprovedEmail(params: { to: string; orderNumber: string }): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.error("RESEND_API_KEY is not set -- skipping order-approved email.");
    return;
  }

  // order= pre-fills the order number on /track -- the customer still has
  // to type their own email there, so this link doesn't hand a would-be
  // guesser anything they couldn't already read straight out of this
  // email (the order number is already in the subject and body above).
  const trackUrl = `${SITE_URL}/track?order=${encodeURIComponent(params.orderNumber)}`;
  const orderNumber = escapeHtml(params.orderNumber);

  const html = wrapEmailHtml(`
    <h1 style="font-size:22px; margin:0 0 16px; font-weight:600;">Your order is confirmed</h1>
    <p style="margin:0 0 12px; line-height:1.5;">We've checked your payment for order <strong>${orderNumber}</strong> and it's approved.</p>
    <p style="margin:0 0 12px; line-height:1.5;">Next up: we'll pack and post it within the week.</p>
    <a href="${trackUrl}" style="display:inline-block; background:#1C1712; color:#FFFDF8; padding:10px 20px; text-decoration:none; font-size:14px; margin-top:8px;">Track your order &rarr;</a>
    <p style="margin:24px 0 0; color:#8B8175; font-size:13px;">Thanks for shopping at Art Kade.</p>
  `);
  const text = `Your order is confirmed.

We've checked your payment for order ${params.orderNumber} and it's approved.

Next up: we'll pack and post it within the week.

Track your order: ${trackUrl}

Thanks for shopping at Art Kade.`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    replyTo: REPLY_TO_EMAIL,
    subject: `Order ${params.orderNumber} approved`,
    html,
    text,
  });
  if (error) console.error("Failed to send order-approved email:", error);
}

export async function sendOrderRejectedEmail(params: { to: string; orderNumber: string }): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.error("RESEND_API_KEY is not set -- skipping order-rejected email.");
    return;
  }

  const orderNumber = escapeHtml(params.orderNumber);

  const html = wrapEmailHtml(`
    <h1 style="font-size:22px; margin:0 0 16px; font-weight:600;">We couldn't confirm your order</h1>
    <p style="margin:0 0 12px; line-height:1.5;">We weren't able to verify the payment for order <strong>${orderNumber}</strong>, so it hasn't gone through.</p>
    <p style="margin:0 0 12px; line-height:1.5;">If you think this is a mistake, just reply to this email and we'll sort it out.</p>
  `);
  const text = `We couldn't confirm your order.

We weren't able to verify the payment for order ${params.orderNumber}, so it hasn't gone through.

If you think this is a mistake, just reply to this email and we'll sort it out.`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    replyTo: REPLY_TO_EMAIL,
    subject: `Order ${params.orderNumber} couldn't be confirmed`,
    html,
    text,
  });
  if (error) console.error("Failed to send order-rejected email:", error);
}

// Staff-facing, not customer-facing -- goes to the same inbox that already
// handles fulfillment (REPLY_TO_EMAIL's default), not the customer. Fired
// from placeOrder (app/checkout/actions.ts) right after a real order is
// created, so Varsha doesn't have to keep the /admin/orders tab open and
// polling to notice a new one came in.
export async function sendAdminNewOrderNotification(params: {
  orderNumber: string;
  customerName: string;
  items: { name: string; variantLabel: string; quantity: number }[];
  totalAmount: number;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.error("RESEND_API_KEY is not set -- skipping admin new-order notification.");
    return;
  }

  const adminOrdersUrl = `${SITE_URL}/admin/orders`;
  // Plain-text itemLines for the text part below; the html part builds its
  // own HTML-escaped copy separately so the plain-text email never shows
  // literal &amp;-style entities.
  const itemLines = params.items.map((i) => `${i.name} (${i.variantLabel}) x${i.quantity}`);

  // orderNumber is regex-constrained before it ever reaches here, but
  // customerName and the item name/variant label are not (customerName is
  // straight from the checkout form; item name/label come from the vendor's
  // own catalogue entries) -- escape everything interpolated below rather
  // than special-case which fields are "safe enough" today.
  const orderNumber = escapeHtml(params.orderNumber);
  const customerName = escapeHtml(params.customerName);
  const escapedItemLines = params.items.map(
    (i) => `${escapeHtml(i.name)} (${escapeHtml(i.variantLabel)}) x${i.quantity}`
  );

  const html = wrapEmailHtml(`
    <h1 style="font-size:22px; margin:0 0 16px; font-weight:600;">New order: ${orderNumber}</h1>
    <p style="margin:0 0 12px; line-height:1.5;"><strong>${customerName}</strong> just placed an order.</p>
    <ul style="margin:0 0 12px; padding-left:20px; line-height:1.6;">
      ${escapedItemLines.map((line) => `<li>${line}</li>`).join("")}
    </ul>
    <p style="margin:0 0 20px; line-height:1.5;"><strong>Total: Rs. ${params.totalAmount.toLocaleString("en-US")}</strong></p>
    <a href="${adminOrdersUrl}" style="display:inline-block; background:#1C1712; color:#FFFDF8; padding:10px 20px; text-decoration:none; font-size:14px;">Review in admin &rarr;</a>
  `);
  const text = `New order: ${params.orderNumber}

${params.customerName} just placed an order.

${itemLines.join("\n")}

Total: Rs. ${params.totalAmount.toLocaleString("en-US")}

Review it here: ${adminOrdersUrl}`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: REPLY_TO_EMAIL,
    subject: `New order ${params.orderNumber} -- Rs. ${params.totalAmount.toLocaleString("en-US")}`,
    html,
    text,
  });
  if (error) console.error("Failed to send admin new-order notification:", error);
}
