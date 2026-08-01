"use client";

import { useState } from "react";
import { recordOfflineSale } from "../mode-actions";
import { ActionForm } from "@/components/ActionForm";

export type Variant = { id: string; label: string; price: number; stock: number };
export type CatalogueProduct = { id: string; name: string; poolStock: number | null; variants: Variant[] };
export type CatalogueSection = { category: string; label: string; products: CatalogueProduct[] };
export type SoldTodayEntry = { productId: string; productName: string; poolStock: number | null; variant: Variant };

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

// One "Sold" row -- shared between the Sold Today quick-resell list and the
// grouped catalogue below it, so a variant looks and behaves identically no
// matter which section it's tapped from. productName is only passed for the
// Sold Today list, which isn't grouped under a product heading the way the
// main catalogue is.
function SaleRowForm({
  artistId,
  productId,
  productName,
  variant,
  poolStock,
}: {
  artistId: string;
  productId: string;
  productName?: string;
  variant: Variant;
  poolStock: number | null;
}) {
  return (
    <ActionForm
      action={recordOfflineSale}
      successMessage="Logged."
      resetOnSuccess
      style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}
    >
      <input type="hidden" name="artistId" value={artistId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variant.id} />
      <span style={{ fontSize: 13, flex: "1 1 160px" }}>
        {productName ? `${productName} — ` : ""}
        {variant.label} — Rs. {variant.price.toLocaleString("en-US")}
        {poolStock == null ? ` — ${variant.stock} in stock` : ""}
      </span>
      <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 56, padding: 4 }} />
      <input type="text" name="notes" placeholder="Note (optional)" style={{ width: 140, padding: 4, fontSize: 12 }} />
      <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }} disabled={variant.stock <= 0}>
        {variant.stock <= 0 ? "Sold out" : "Sold"}
      </button>
    </ActionForm>
  );
}

// Vendor Mode's product list -- a client component (unlike the rest of the
// page) specifically so search filtering and section collapse are instant,
// no round trip, which matters when this is used standing up at a market
// stall with a customer waiting. `sections` and `soldToday` arrive fully
// resolved from the server (category grouping/order, sorted variants,
// shared-pool aggregation, today's distinct sold variants) -- this
// component only owns the search text and which sections are collapsed,
// nothing about the catalogue data itself.
export default function VendorModeCatalogue({
  artistId,
  sections,
  soldToday,
}: {
  artistId: string;
  sections: CatalogueSection[];
  soldToday: SoldTodayEntry[];
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // A category with nothing matching just disappears rather than showing an
  // empty, pointless header -- searching "waves" shouldn't still print
  // "Sticker box (0)" between two other sections.
  const visibleSections = isSearching
    ? sections
        .map((section) => ({
          ...section,
          products: section.products.filter((p) => p.name.toLowerCase().includes(normalizedQuery)),
        }))
        .filter((section) => section.products.length > 0)
    : sections;

  const totalProducts = sections.reduce((sum, s) => sum + s.products.length, 0);

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Log a sale</h2>

      {totalProducts === 0 ? (
        <p style={{ fontSize: 13, color: "#999" }}>No active products.</p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            style={{ width: "100%", padding: 10, fontSize: 15, boxSizing: "border-box", marginBottom: 16 }}
          />

          {soldToday.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "#666",
                  marginBottom: 4,
                }}
              >
                Sold today
              </h3>
              {soldToday.map((entry) => (
                <SaleRowForm
                  key={entry.variant.id}
                  artistId={artistId}
                  productId={entry.productId}
                  productName={entry.productName}
                  variant={entry.variant}
                  poolStock={entry.poolStock}
                />
              ))}
            </div>
          )}

          {isSearching && visibleSections.length === 0 && (
            <p style={{ fontSize: 13, color: "#999" }}>No products match "{query}".</p>
          )}

          {visibleSections.map((section) => {
            // While searching, every matching section stays open regardless
            // of its collapsed state -- a result you typed for shouldn't be
            // hidden behind a header you happened to have closed earlier.
            const isOpen = isSearching || !collapsed[section.category];
            return (
              <div key={section.category} style={{ borderTop: "1px solid #eee", marginTop: 10, paddingTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [section.category]: !prev[section.category] }))}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    padding: "4px 0",
                    background: "none",
                    border: "none",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <span>
                    {section.label}{" "}
                    <span style={{ fontWeight: 400, color: "#666", fontSize: 13 }}>({section.products.length})</span>
                  </span>
                  <span style={{ color: "#666", fontSize: 18, lineHeight: 1 }}>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen &&
                  section.products.map((product) => (
                    <div key={product.id} style={{ marginTop: 10 }}>
                      <strong style={{ fontSize: 14 }}>{product.name}</strong>
                      {product.poolStock != null && (
                        <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>
                          {product.poolStock} in stock across all sizes
                        </span>
                      )}
                      {product.variants.map((v) => (
                        <SaleRowForm key={v.id} artistId={artistId} productId={product.id} variant={v} poolStock={product.poolStock} />
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
