"use client";

import { useState, type FormEvent } from "react";
import { lookupOrder, type TrackResult } from "./actions";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/orders";
import { SHIPPING_METHOD_LABELS, type ShippingMethod } from "@/lib/shipping";

export default function TrackForm({ initialOrderNumber }: { initialOrderNumber: string }) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("orderNumber", orderNumber);
      formData.set("email", email);
      setResult(await lookupOrder(formData));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4 mb-10">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wide mb-1">
            Order number
          </label>
          <input
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="ARTK-000482"
            className="w-full border border-line px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wide mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line px-3 py-2 text-sm bg-white"
          />
        </div>

        {result?.ok === false && <p className="text-sm text-red-600">{result.error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          {submitting ? "Looking up..." : "Track order"}
        </button>
      </form>

      {result?.ok && (
        <div className="border border-line bg-white p-6">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-lg">{result.order.orderNumber}</span>
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: ORDER_STATUS_COLORS[result.order.status] ?? "#666" }}
            >
              {ORDER_STATUS_LABELS[result.order.status] ?? result.order.status}
            </span>
          </div>
          <p className="text-xs text-warm-grey mb-4">
            Placed {new Date(result.order.createdAt).toLocaleString()}
          </p>

          <ul className="divide-y divide-line text-sm mb-4">
            {result.order.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="truncate">{item.name}</p>
                  {item.variantLabel && (
                    <p className="text-xs text-warm-grey truncate">{item.variantLabel}</p>
                  )}
                </div>
                <span className="font-mono text-xs shrink-0">
                  {item.quantity} × Rs. {item.unitPrice.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between font-medium text-sm mb-4">
            <span>Total</span>
            <span className="font-mono">Rs. {result.order.totalAmount.toLocaleString("en-US")}</span>
          </div>

          <p className="text-xs text-warm-grey mb-4">
            {result.order.isBulk
              ? "Bulk order -- shipping arranged separately via WhatsApp."
              : result.order.shippingMethod
                ? `Shipping via ${SHIPPING_METHOD_LABELS[result.order.shippingMethod as ShippingMethod] ?? result.order.shippingMethod}.`
                : null}
          </p>

          {result.order.history.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-xs font-mono uppercase tracking-wide text-warm-grey mb-2">
                Timeline
              </p>
              <ul className="space-y-1 text-xs text-warm-grey">
                {result.order.history.map((h, i) => (
                  <li key={i}>
                    <span
                      className="font-medium"
                      style={{ color: ORDER_STATUS_COLORS[h.status] ?? "#666" }}
                    >
                      {ORDER_STATUS_LABELS[h.status] ?? h.status}
                    </span>{" "}
                    · {new Date(h.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
