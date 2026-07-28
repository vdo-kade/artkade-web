"use client";

import { useState, type ReactNode } from "react";

export type OrderGridItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  statusLabel: string;
  statusColor: string;
  // Short compact-card summary line, e.g. "2 items · Rs. 5,000" or a list
  // of item names -- whichever's more useful to the caller's audience.
  summaryLine: string;
  // The existing full order detail (items table, proof, actions, status
  // history, notes), unchanged -- rendered server-side and passed straight
  // through, same pattern as ProductStockGrid's own editCard.
  detailCard: ReactNode;
};

// Compact-card grid + click-to-expand-in-place detail, mirroring
// ProductStockGrid (app/vendor/ProductStockGrid.tsx) -- a long list of
// fully-expanded orders is the exact same "30 screens of scrolling to
// find one" problem the Stock tab solved by gridding products, so orders
// get the same fix rather than a second pattern. Only one order expanded
// at a time; closing it collapses back to the grid.
export default function OrderGrid({ orders }: { orders: OrderGridItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = orders.find((o) => o.id === expandedId);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {orders.map((o) => {
          const isExpanded = o.id === expandedId;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : o.id)}
              style={{
                display: "block",
                textAlign: "left",
                padding: 10,
                border: isExpanded ? "2px solid #333" : "1px solid #ddd",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <strong style={{ fontSize: 13 }}>{o.orderNumber}</strong>
                <span
                  style={{
                    fontSize: 10,
                    color: o.statusColor,
                    textTransform: "uppercase",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o.statusLabel}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  marginTop: 4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {o.customerName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {o.summaryLine}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                {isExpanded ? "Viewing…" : "View ›"}
              </div>
            </button>
          );
        })}
      </div>

      {expanded && (
        <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: 16, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Close
            </button>
          </div>
          {expanded.detailCard}
        </div>
      )}
    </div>
  );
}
