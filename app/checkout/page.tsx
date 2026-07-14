"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useBag } from "@/components/BagProvider";
import { createClient } from "@/lib/supabase";

function generateOrderNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `ARTK-${n}`;
}

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
          Payment details aren&apos;t set up yet — please contact us before sending a transfer.
        </p>
      )}
      <p className="text-xs text-warm-grey mt-3">
        Transfer the total below, then upload a screenshot of the confirmation.
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  const { items, totalAmount, clear } = useBag();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Your bag is empty.");
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

      const supabase = createClient();

      // RLS lets anon INSERT into orders but never read rows back (see
      // supabase/schema.sql), so .insert(...).select() would fail on the
      // implicit SELECT it triggers. Generate the id client-side instead so
      // order_items can reference it without reading the order back.
      const order_id = crypto.randomUUID();

      const { error: orderError } = await supabase.from("orders").insert({
        id: order_id,
        order_number,
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        shipping_address: address,
        status: "awaiting_review",
        payment_proof_url: uploadJson.path,
        total_amount: totalAmount,
        customer_notes: notes || null,
      });
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from("order_items").insert(
        items.map((item) => ({
          order_id,
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        }))
      );
      if (itemsError) throw itemsError;

      clear();
      setOrderNumber(order_number);
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
          <div>
            <Link
              href="/"
              className="inline-block bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Back to Art Kade
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
                {items.map((item) => (
                  <li
                    key={item.variantId}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-warm-grey text-xs">
                        {item.variantLabel} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-mono">
                      Rs. {(item.unitPrice * item.quantity).toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-4 font-medium">
                <span>Total</span>
                <span className="font-mono">
                  Rs. {totalAmount.toLocaleString("en-US")}
                </span>
              </div>
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
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {submitting ? "Placing order..." : "Place order"}
              </button>
            </form>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
