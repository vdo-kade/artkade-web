"use client";

import { useState, useTransition } from "react";
import { deleteProductVariant } from "./actions";

export type VariantRow = {
  id: string;
  label: string;
  price: number;
  stock: number;
  editionSize: number | null;
};

// Mirrors MAX_PRODUCT_VARIANTS in ./actions.ts -- kept in sync manually
// since that constant lives in a "use server" module this client component
// can't import a plain value from.
const MAX_PRODUCT_VARIANTS = 10;

function keyOf(rows: VariantRow[]): string {
  return rows.map((r) => r.id).join(",");
}

// Add/remove sizes on an existing product, plus each size's price/stock/
// edition_size. Rendered inside the product edit form's own <form> (see
// ProductEditCard) -- "Add variant" only ever touches local state (the new
// row's fields get saved together with everything else on the form's own
// "Save changes" submit), while removing an EXISTING size calls
// deleteProductVariant immediately, since that's a real, guarded delete
// that needs its own confirmation rather than waiting for a batch save.
export default function ProductVariantManager({
  productId,
  variants,
  sharedStockPool,
  isOneOff,
}: {
  productId: string;
  variants: VariantRow[];
  sharedStockPool: boolean;
  isOneOff: boolean;
}) {
  // Same resync-on-id-change trick as ProductImageManager: local `rows`
  // mirrors the server's `variants` prop so a locally-added blank row can
  // be edited before it's saved, but once a save (or an immediate delete)
  // actually lands and the page revalidates, the fresh prop takes over
  // again -- there's never a locally-added row left stranded after its own
  // submit succeeds, since by then it's a real row in the incoming prop.
  const [rows, setRows] = useState(variants);
  const [syncedKey, setSyncedKey] = useState(() => keyOf(variants));
  const incomingKey = keyOf(variants);
  if (incomingKey !== syncedKey) {
    setSyncedKey(incomingKey);
    setRows(variants);
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existingCount = rows.filter((r) => !r.id.startsWith("new-")).length;

  function addRow() {
    if (rows.length >= MAX_PRODUCT_VARIANTS) return;
    setRows([...rows, { id: `new-${crypto.randomUUID()}`, label: "", price: 0, stock: 0, editionSize: null }]);
  }

  function removeNewRow(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  function removeExistingRow(id: string, stock: number) {
    if (existingCount <= 1) return;
    const message =
      stock > 0
        ? `This size still has ${stock} in stock. Remove it anyway?`
        : "Remove this size?";
    if (!window.confirm(message)) return;

    const prev = rows;
    setRows(rows.filter((r) => r.id !== id));
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("variantId", id);
    startTransition(async () => {
      const result = await deleteProductVariant(fd);
      if (result && !result.ok) {
        setError(result.error);
        setRows(prev);
      }
    });
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {rows.map((row) => {
        const isNew = row.id.startsWith("new-");
        const canRemove = isNew || existingCount > 1;
        return (
          <div key={row.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input type="hidden" name="variantId" value={row.id} />
            <input
              style={{ flex: "2 1 140px", minWidth: 0, padding: 4, fontSize: 13, boxSizing: "border-box" }}
              name={`variantLabel-${row.id}`}
              defaultValue={row.label}
              placeholder="Label (e.g. A5)"
            />
            <label style={{ fontSize: 12, color: "#666" }}>Price</label>
            <input
              type="number"
              min={0}
              step="0.01"
              name={`variantPrice-${row.id}`}
              defaultValue={row.price}
              style={{ width: 80, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
            />
            {!sharedStockPool && (
              <>
                <label style={{ fontSize: 12, color: "#666" }}>Stock</label>
                <input
                  type="number"
                  min={0}
                  max={isOneOff ? 1 : undefined}
                  name={`variantStock-${row.id}`}
                  defaultValue={isOneOff ? Math.min(row.stock, 1) : row.stock}
                  style={{ width: 70, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
                />
                <label style={{ fontSize: 12, color: "#666" }} title="Original run size for the countdown badge -- leave blank for a regular, non-limited size">
                  Edition
                </label>
                <input
                  type="number"
                  min={0}
                  name={`variantEditionSize-${row.id}`}
                  defaultValue={row.editionSize ?? ""}
                  placeholder="none"
                  style={{ width: 70, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => (isNew ? removeNewRow(row.id) : removeExistingRow(row.id, row.stock))}
              disabled={!canRemove}
              title={canRemove ? "Remove this size" : "A product needs at least one size"}
              style={{
                padding: "2px 8px",
                color: canRemove ? "#b00" : "#ccc",
                border: `1px solid ${canRemove ? "#b00" : "#ccc"}`,
                background: "none",
                cursor: canRemove ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              &times;
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_PRODUCT_VARIANTS}
        style={{ padding: "4px 10px", fontSize: 12, marginTop: 2 }}
      >
        + Add a size
      </button>
      {pending && <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Removing…</p>}
      {!pending && error && <p style={{ fontSize: 12, color: "#b00", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
