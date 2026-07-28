"use client";

import { useState } from "react";
import OrderGrid, { type OrderGridItem } from "./OrderGrid";
import type { WeekGroup } from "@/lib/orders";

// Collapsible week-by-week grouping on top of OrderGrid's card grid -- the
// most recent week starts open (the common case: reviewing what just came
// in), older weeks stay collapsed behind a single click instead of an
// ever-growing flat list.
export default function WeeklyOrders({
  sections,
  emptyMessage,
}: {
  sections: WeekGroup<OrderGridItem>[];
  emptyMessage: string;
}) {
  const [openWeek, setOpenWeek] = useState<string | null>(sections[0]?.weekKey ?? null);

  if (sections.length === 0) {
    return <p style={{ fontSize: 13, color: "#999" }}>{emptyMessage}</p>;
  }

  return (
    <div>
      {sections.map((section) => {
        const isOpen = section.weekKey === openWeek;
        return (
          <div key={section.weekKey} style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setOpenWeek(isOpen ? null : section.weekKey)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "8px 12px",
                background: "#f5f5f5",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span>
                {section.weekLabel} — {section.orders.length} order{section.orders.length === 1 ? "" : "s"}
              </span>
              <span style={{ fontSize: 11, color: "#666", fontWeight: "normal" }}>
                {isOpen ? "Hide ▲" : "Show ▼"}
              </span>
            </button>
            {isOpen && (
              <div style={{ marginTop: 10 }}>
                <OrderGrid orders={section.orders} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
