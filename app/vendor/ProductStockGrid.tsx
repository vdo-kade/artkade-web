"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";

export type StockGridProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  stockRemaining: number;
  isActive: boolean;
  // The existing per-product edit form (ActionForm + variant rows + delete
  // button), unchanged -- rendered server-side and passed straight through,
  // same pattern DashboardTabs already uses for its own tab panels.
  editCard: ReactNode;
};

export type StockGridSection = { title: string; products: StockGridProduct[] };

// Thumbnail-grid replacement for what used to be a full-height stack of
// fully-expanded edit forms, one per product, on the vendor dashboard's
// Stock tab -- a stall with 30+ products meant 30+ screens of scrolling
// just to find one. Clicking a thumbnail reveals that exact same edit
// form (nothing about the edit flow itself changed) in a panel under its
// category's grid instead of leaving every product permanently expanded.
export default function ProductStockGrid({ sections }: { sections: StockGridSection[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      {sections.map((section) => {
        const expandedProduct = section.products.find((p) => p.id === expandedId);
        return (
          <div key={section.title} style={{ marginTop: 24 }}>
            <h3
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "#666",
                marginBottom: 10,
              }}
            >
              {section.title} ({section.products.length})
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                gap: 10,
              }}
            >
              {section.products.map((p) => {
                const isExpanded = p.id === expandedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    style={{
                      display: "block",
                      textAlign: "left",
                      padding: 6,
                      border: isExpanded ? "2px solid #333" : "1px solid #ddd",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        background: "#f2f2f2",
                        marginBottom: 6,
                        overflow: "hidden",
                        borderRadius: 4,
                      }}
                    >
                      {p.imageUrl && (
                        <Image
                          src={p.imageUrl}
                          alt={p.name}
                          fill
                          sizes="120px"
                          style={{ objectFit: "cover" }}
                        />
                      )}
                      {!p.isActive && (
                        <span
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            fontSize: 10,
                            background: "#333",
                            color: "#fff",
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          Hidden
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1.25,
                        marginBottom: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: p.stockRemaining === 0 ? "#b00020" : "#666" }}>
                      {p.stockRemaining === 0 ? "Out of stock" : `${p.stockRemaining} in stock`}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      {isExpanded ? "Editing…" : "Edit ›"}
                    </div>
                  </button>
                );
              })}
            </div>

            {expandedProduct && (
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
                {expandedProduct.editCard}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
