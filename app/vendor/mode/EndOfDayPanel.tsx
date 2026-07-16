"use client";

import { useState } from "react";

type SaleRow = {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  sold_at: string;
  products: { name: string } | null;
  product_variants: { label: string } | null;
};

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

// Purely a display toggle -- collapses today's sales into a closing
// summary. Doesn't touch offline_sales or stock in any way: every sale
// logged above (including a last-minute one added after "End of day") is
// already saved and already decremented stock the moment it was logged,
// same as any other Vendor Mode sale, one-off or not.
export default function EndOfDayPanel({ sales, total }: { sales: SaleRow[]; total: number }) {
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Day closed</h2>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          {sales.length} sale{sales.length === 1 ? "" : "s"} · Rs. {total.toLocaleString("en-US")}
        </p>
        <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
          Missed a sale? Log it above &uarr; -- it'll still count for today and deduct stock right away.
        </p>
        <button type="button" onClick={() => setClosed(false)} style={{ padding: "6px 14px", fontSize: 13 }}>
          Reopen
        </button>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18 }}>Today's sales</h2>
        <button
          type="button"
          onClick={() => setClosed(true)}
          disabled={sales.length === 0}
          style={{ padding: "4px 10px", fontSize: 13 }}
        >
          End of day
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        {sales.length} sale{sales.length === 1 ? "" : "s"} · Rs. {total.toLocaleString("en-US")}
      </p>
      {sales.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>Nothing logged yet today.</p>}
      {sales.map((s) => (
        <p key={s.id} style={{ fontSize: 13, margin: "4px 0" }}>
          {s.products?.name ?? "(deleted product)"} — {s.product_variants?.label ?? "-"} &times; {s.quantity} — Rs.{" "}
          {(s.unit_price * s.quantity).toLocaleString("en-US")}
          <span style={{ color: "#999" }}> · {new Date(s.sold_at).toLocaleTimeString()}</span>
          {s.notes && <span style={{ color: "#999" }}> · "{s.notes}"</span>}
        </p>
      ))}
    </section>
  );
}
