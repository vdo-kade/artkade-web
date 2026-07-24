"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useBag, bagItemKey } from "@/components/BagProvider";
import { createClient } from "@/lib/supabase";
import { placeOrder } from "./actions";
import { SHIPPING_METHOD_LABELS, type ShippingMethod } from "@/lib/shipping";

function generateOrderNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `ARTK-${n}`;
}

const MIN_ORDER_TOTAL = 1350;

type BankDetails = {
  bank_name: string;
  branch: string;
  account_holder_name: string;
  account_number: string;
};

function BankTransferDetails() {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("bank_transfer_details")
      .select("bank_name, branch, account_holder_name, account_number")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load bank transfer details:", error);
        setDetails(data ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="border border-line p-4 bg-white mb-6">
      <h2 className="font-display text-xl mb-3">Pay by bank transfer</h2>
      {!loaded ? (
        <p className="text-sm text-warm-grey">Loading payment details...</p>
      ) : details ? (
        <dl className="text-sm space-y-1">
          <div className="flex justify-between gap-4">
            <dt className="text-warm-grey">Bank</dt>
            <dd className="font-mono text-right">{details.bank_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-warm-grey">Branch</dt>
            <dd className="font-mono text-right">{details.branch}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-warm-grey">Account holder</dt>
            <dd className="font-mono text-right">{details.account_holder_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-warm-grey">Account number</dt>
            <dd className="font-mono text-right">{details.account_number}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-warm-grey">
          Payment details aren&apos;t set up yet. Please contact us before sending a transfer.
        </p>
      )}
      <p className="text-xs text-warm-grey mt-3">
        Transfer the total below, then upload a screenshot of the confirmation.
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  const { items, totalAmount, clear, removeItem, updateQuantity } = useBag();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [isBulk, setIsBulk] = useState(false);
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("registered_post");

  const amountUnderMinimum = MIN_ORDER_TOTAL - totalAmount;
  const belowMinimum = items.length > 0 && amountUnderMinimum > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Your bag is empty.");
      return;
    }
    if (belowMinimum) {
      setError(
        `Minimum order is Rs. ${MIN_ORDER_TOTAL.toLocaleString("en-US")}. Add Rs. ${amountUnderMinimum.toLocaleString("en-US")} more to continue.`
      );
      return;
    }
    if (!file) {
      setError("Please upload your payment confirmation screenshot.");
      return;
    }

    setSubmitting(true);
    const order_number = generateOrderNumber();

    try {
      const uploadForm = new FormData();
      uploadForm.set("file", file);
      uploadForm.set("orderNumber", order_number);

      const uploadRes = await fetch("/api/upload-payment-proof", {
        method: "POST",
        body: uploadForm,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error || "Failed to upload payment proof.");
      }

      // The order itself is created server-side (see ./actions.ts) -- only
      // variantId/quantity are sent, never a price. The server re-derives
      // price/total from product_variants, actually reserves stock (not
      // just checks it's non-zero), and re-enforces the minimum below --
      // this client-side check is a convenience, not the real gate.
      const result = await placeOrder({
        items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        shippingAddress: address,
        customerNotes: notes || null,
        paymentProofPath: uploadJson.path,
        orderNumber: order_number,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      clear();
      setIsBulk(result.isBulk);
      setShippingMethod(result.shippingMethod);
      setOrderNumber(result.orderNumber);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong placing your order."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (orderNumber) {
    return (
      <>
        <Header />
        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="font-mono text-xs uppercase tracking-eyebrow text-accent mb-4">
            Order received
          </p>
          <h1 className="font-display text-4xl mb-4">Thank you!</h1>
          <p className="text-warm-grey mb-6">
            We&apos;ll confirm once we&apos;ve checked your payment. Hang on to
            your order number:
          </p>
          <p className="font-mono text-lg bg-white border border-line inline-block px-4 py-2 mb-8">
            {orderNumber}
          </p>
          {isBulk ? (
            <p className="text-warm-grey mb-8 border border-line bg-white p-4 text-left">
              This order is on the larger side (over 1kg), so it needs its own shipping
              rate rather than our usual free shipping. Message us on WhatsApp at{" "}
              <a href="https://wa.me/94773891111" className="text-accent underline" target="_blank" rel="noopener noreferrer">
                077 389 1111
              </a>{" "}
              and we&apos;ll sort out the details.
            </p>
          ) : (
            <p className="text-warm-grey mb-8 border border-line bg-white p-4 text-left">
              Free shipping via {SHIPPING_METHOD_LABELS[shippingMethod]}.{" "}
              {shippingMethod === "registered_post"
                ? "We pack orders over the weekend and post every Monday."
                : "We'll be in touch with tracking once it's on its way."}
            </p>
          )}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/"
              className="inline-block bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Back to Art Kade
            </Link>
            <Link
              href={`/track?order=${encodeURIComponent(orderNumber)}`}
              className="inline-block border border-ink px-7 py-3 text-sm font-medium hover:border-accent hover:text-accent transition-colors"
            >
              Track this order
            </Link>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-display text-4xl mb-8">Checkout</h1>

        {items.length === 0 ? (
          <p className="text-warm-grey">
            Your bag is empty.{" "}
            <Link href="/#stalls" className="text-accent underline">
              Browse the stalls
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl mb-4">Your bag</h2>
              <ul className="divide-y divide-line border border-line">
                {items.map((item) => {
                  const atMax = item.availableStock != null && item.quantity >= item.availableStock;
                  return (
                    <li
                      key={bagItemKey(item)}
                      className="flex items-center justify-between gap-3 p-3 text-sm flex-wrap"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-warm-grey text-xs">{item.variantLabel}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center border border-line">
                          <button
                            type="button"
                            onClick={() => updateQuantity(bagItemKey(item), item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            aria-label={`Decrease quantity of ${item.productName}`}
                            className="w-7 h-7 flex items-center justify-center hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            −
                          </button>
                          <span className="w-7 text-center font-mono text-xs">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(bagItemKey(item), item.quantity + 1)}
                            disabled={atMax}
                            title={atMax ? "No more in stock" : undefined}
                            aria-label={`Increase quantity of ${item.productName}`}
                            className="w-7 h-7 flex items-center justify-center hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-mono">
                          Rs. {(item.unitPrice * item.quantity).toLocaleString("en-US")}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(bagItemKey(item))}
                          aria-label={`Remove ${item.productName} from bag`}
                          className="text-warm-grey hover:text-red-600 transition-colors text-xs underline"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between mt-4 font-medium">
                <span>Total</span>
                <span className="font-mono">
                  Rs. {totalAmount.toLocaleString("en-US")}
                </span>
              </div>
              <div className="border border-line bg-white p-4 mt-4 text-sm text-warm-grey">
                <p className="font-medium text-ink mb-1">Shipping</p>
                <p>
                  Free shipping on everything. Stickers and small prints (A6-A4) under 1kg
                  go by Registered Post -- packed over the weekend, posted every Monday.
                  Bigger prints (A3 and up), mixed orders, or anything over 1kg goes by
                  courier instead. Orders over 1kg count as bulk and need their own
                  shipping rate -- if that&apos;s you, we&apos;ll ask you to reach us on
                  WhatsApp (077 389 1111) to sort it out rather than checking out here.
                </p>
              </div>
              {belowMinimum && (
                <p className="text-sm text-red-600 mt-2">
                  Minimum order is Rs. {MIN_ORDER_TOTAL.toLocaleString("en-US")}. Add Rs.{" "}
                  {amountUnderMinimum.toLocaleString("en-US")} more to continue.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Full name
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Phone
                </label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Shipping address
                </label>
                <textarea
                  required
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-line px-3 py-2 text-sm bg-white"
                />
              </div>
              <BankTransferDetails />

              <div>
                <label className="block text-xs font-mono uppercase tracking-wide mb-1">
                  Bank transfer screenshot
                </label>
                <input
                  required
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || belowMinimum}
                className="w-full bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {submitting
                  ? "Placing order..."
                  : belowMinimum
                    ? `Add Rs. ${amountUnderMinimum.toLocaleString("en-US")} more to order`
                    : "Place order"}
              </button>
            </form>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
