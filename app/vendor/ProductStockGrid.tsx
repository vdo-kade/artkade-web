"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { reorderProducts } from "./actions";

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

export type StockGridSection = { title: string; category: string; products: StockGridProduct[] };

// Thumbnail-grid replacement for what used to be a full-height stack of
// fully-expanded edit forms, one per product, on the vendor dashboard's
// Stock tab -- a stall with 30+ products meant 30+ screens of scrolling
// just to find one. Clicking a thumbnail reveals that exact same edit
// form (nothing about the edit flow itself changed) in a panel under its
// category's grid instead of leaving every product permanently expanded.
// Drag-to-reorder (same interaction as ProductImageManager's photo
// gallery) persists products.sort_order within a single category section
// -- see reorderProducts, which only ever touches the products in that one
// section, never another category's.
export default function ProductStockGrid({
  artistId,
  sections,
}: {
  artistId: string;
  sections: StockGridSection[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Only the DISPLAY ORDER within a category is ever cached locally, as a
  // short-lived optimistic override between a drop and the next server
  // round-trip -- product content (name/image/editCard/stock) always comes
  // straight from the live `sections` prop below, never a locally cached
  // copy of it. Caching whole product/section objects locally (as an
  // earlier version of this component did) went stale the instant a
  // product's own data changed without its position changing too -- e.g.
  // saving an edit inside an expanded editCard revalidates the page, but
  // the *set* of product ids in its section doesn't change, so a
  // fingerprint keyed on ids alone never noticed and kept rendering the
  // stale pre-save editCard. Clearing on every new `sections` reference
  // (which a server revalidation always produces, including the one this
  // same drag's own persistOrder call triggers) means the override never
  // outlives the round-trip that made it unnecessary.
  const [orderOverride, setOrderOverride] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setOrderOverride({});
  }, [sections]);

  function displayProducts(section: StockGridSection): StockGridProduct[] {
    const order = orderOverride[section.category];
    if (!order) return section.products;
    const byId = new Map(section.products.map((p) => [p.id, p]));
    const ordered = order.map((id) => byId.get(id)).filter((p): p is StockGridProduct => !!p);
    // Defensive: if the live prop's product set has changed underneath the
    // override (a product added/removed/moved category since the drag),
    // fall back to the fresh order rather than risk dropping a product.
    return ordered.length === section.products.length ? ordered : section.products;
  }

  const [, startTransition] = useTransition();
  const [drag, setDrag] = useState<{ category: string; index: number } | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function persistOrder(category: string, next: StockGridProduct[]) {
    setOrderOverride((prev) => ({ ...prev, [category]: next.map((p) => p.id) }));
    const fd = new FormData();
    fd.set("artistId", artistId);
    next.forEach((p) => fd.append("productId", p.id));
    startTransition(async () => {
      await reorderProducts(fd);
      // Errors here are rare (only a stale-list race -- see reorderProducts'
      // own guard) and self-heal on the next natural revalidation, so
      // there's no dedicated error UI for this specific action, same as
      // ProductImageManager's reorder call.
    });
  }

  function handleDrop(category: string, dropIndex: number) {
    setOverIndex(null);
    const from = drag;
    setDrag(null);
    if (!from || from.category !== category || from.index === dropIndex) return;
    const section = sections.find((s) => s.category === category);
    if (!section) return;
    const current = displayProducts(section);
    const next = [...current];
    const [moved] = next.splice(from.index, 1);
    next.splice(dropIndex, 0, moved);
    persistOrder(category, next);
  }

  return (
    <div>
      {sections.map((section) => {
        const products = displayProducts(section);
        const expandedProduct = products.find((p) => p.id === expandedId);
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
              {section.title} ({products.length})
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                gap: 10,
              }}
            >
              {products.map((p, index) => {
                const isExpanded = p.id === expandedId;
                const isDragging = drag?.category === section.category && drag.index === index;
                const isOver = drag?.category === section.category && overIndex === index && !isDragging;
                return (
                  <button
                    key={p.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDrag({ category: section.category, index });
                      e.dataTransfer.setData("text/plain", String(index));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (drag?.category !== section.category) return;
                      e.preventDefault();
                      if (overIndex !== index) setOverIndex(index);
                    }}
                    onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(section.category, index);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOverIndex(null);
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    style={{
                      display: "block",
                      textAlign: "left",
                      padding: 6,
                      border: isOver ? "2px dashed #333" : isExpanded ? "2px solid #333" : "1px solid #ddd",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "grab",
                      fontFamily: "inherit",
                      opacity: isDragging ? 0.4 : 1,
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
                      {isExpanded ? "Editing…" : "Drag to reorder · Edit ›"}
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
