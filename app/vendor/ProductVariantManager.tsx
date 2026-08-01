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

// Includes stock/editionSize, not just id, so a save that lands (even one
// that only changed values on already-existing rows, no add/remove) is
// detected as "new server data" and forces every bit of local state below
// -- rows, the toggle, and the pool numbers -- back in sync with it. The
// old static (server-rendered) shared-pool block got this for free just by
// being a Server Component re-executed fresh on every request; now that
// it's local client state, it needs the same explicit resync ProductRow
// ids already got.
function keyOf(rows: VariantRow[], sharedStockPool: boolean): string {
  return `${sharedStockPool}|` + rows.map((r) => `${r.id}:${r.stock}:${r.editionSize}`).join(",");
}

// Splits `total` into `count` whole numbers that add up to exactly `total`
// -- the first `total % count` shares get one extra unit, rather than
// leaving a fractional remainder unaccounted for. Used both directions of
// the shared/per-size toggle so a switch never changes how many real units
// the vendor has on hand, only how they're divided up (see
// ProductVariantManager's onToggleSharedStockPool).
function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Add/remove sizes on an existing product, plus each size's price/stock/
// edition_size. Rendered inside the product edit form's own <form> (see
// ProductEditCard) -- "Add variant" only ever touches local state (the new
// row's fields get saved together with everything else on the form's own
// "Save changes" submit), while removing an EXISTING size calls
// deleteProductVariant immediately, since that's a real, guarded delete
// that needs its own confirmation rather than waiting for a batch save.
//
// Also owns the shared/per-size stock toggle itself (rather than leaving it
// as a static, server-rendered block in ProductEditCard) -- switching modes
// has to recompute numbers live, in the browser, before the vendor ever
// hits Save: turning shared OFF splits the one pool number evenly across
// the current sizes, turning it ON sums the current per-size numbers into
// one pool. Either direction preserves the real total unit count instead of
// leaving stale numbers that would silently multiply or vanish once the
// other mode's aggregate math (lib/catalogue.ts's productStockTotal) starts
// reading them differently.
export default function ProductVariantManager({
  productId,
  variants,
  initialSharedStockPool,
  isOneOff,
}: {
  productId: string;
  variants: VariantRow[];
  initialSharedStockPool: boolean;
  isOneOff: boolean;
}) {
  // Same resync-on-id-change trick as ProductImageManager: local `rows`
  // mirrors the server's `variants` prop so a locally-added blank row can
  // be edited before it's saved, but once a save (or an immediate delete)
  // actually lands and the page revalidates, the fresh prop takes over
  // again -- there's never a locally-added row left stranded after its own
  // submit succeeds, since by then it's a real row in the incoming prop.
  const [rows, setRows] = useState(variants);
  // Product-level pool numbers, shown instead of the per-row Stock/Edition
  // columns while shared mode is on. Seeded from the first variant since
  // every sibling is already numerically identical under shared mode (see
  // lib/stock.ts) -- same convention the old static block used.
  const [sharedStockPool, setSharedStockPool] = useState(initialSharedStockPool);
  const [poolStock, setPoolStock] = useState(variants[0]?.stock ?? 0);
  const [poolEditionSize, setPoolEditionSize] = useState<number | null>(variants[0]?.editionSize ?? null);

  const [syncedKey, setSyncedKey] = useState(() => keyOf(variants, initialSharedStockPool));
  const incomingKey = keyOf(variants, initialSharedStockPool);
  if (incomingKey !== syncedKey) {
    setSyncedKey(incomingKey);
    setRows(variants);
    setSharedStockPool(initialSharedStockPool);
    setPoolStock(variants[0]?.stock ?? 0);
    setPoolEditionSize(variants[0]?.editionSize ?? null);
  }

  // Stock/edition fields are controlled (value+onChange, not defaultValue)
  // specifically so the toggle handler below can read "what's currently
  // typed in" reliably -- an uncontrolled input's live DOM value is
  // invisible to React state until it changes some other way, which would
  // make the pool-sum/split math work off stale numbers whenever a vendor
  // edits a field and then flips the toggle in the same visit.
  function updateRow(id: string, patch: Partial<VariantRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function onToggleSharedStockPool(next: boolean) {
    if (next) {
      // Per-size -> shared: the new pool is the sum of the current sizes,
      // not a copy of any one of them -- summing is what keeps the total
      // number of real units unchanged once every sibling starts reading
      // that same single number instead of being added together.
      const stockSum = rows.reduce((sum, r) => sum + (Number.isFinite(r.stock) ? r.stock : 0), 0);
      const everyRowHasEdition = rows.length > 0 && rows.every((r) => r.editionSize != null);
      const editionSum = everyRowHasEdition ? rows.reduce((sum, r) => sum + (r.editionSize ?? 0), 0) : null;
      setPoolStock(stockSum);
      setPoolEditionSize(editionSum);
    } else {
      // Shared -> per-size: split the one pool number back out across the
      // current sizes as evenly as possible, rather than leaving every row
      // at the full pool value -- that would let the per-size total (a sum)
      // read as the pool multiplied by however many sizes exist.
      const stockShares = splitEvenly(poolStock, rows.length);
      const editionShares = poolEditionSize != null ? splitEvenly(poolEditionSize, rows.length) : null;
      setRows((prev) =>
        prev.map((r, i) => ({
          ...r,
          stock: stockShares[i] ?? 0,
          editionSize: editionShares ? editionShares[i] : null,
        }))
      );
    }
    setSharedStockPool(next);
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
      <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
        <input
          type="checkbox"
          name="sharedStockPool"
          checked={sharedStockPool}
          onChange={(e) => onToggleSharedStockPool(e.target.checked)}
        />{" "}
        One shared stock number across all sizes (off = each size below tracks its own stock)
      </label>

      {sharedStockPool && (
        <div style={{ border: "1px solid #eee", borderRadius: 4, padding: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: "#666" }}>
            Shared stock pool (one number split across every size below)
          </label>
          <input
            type="number"
            min={0}
            name="sharedStock"
            value={poolStock}
            onChange={(e) => setPoolStock(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 100, padding: 4, boxSizing: "border-box", display: "block", marginTop: 4 }}
          />
          <label style={{ fontSize: 12, color: "#666", display: "block", marginTop: 8 }}>
            Shared edition size (one countdown for the whole pool; leave blank for none)
          </label>
          <input
            type="number"
            min={0}
            name="sharedEditionSize"
            value={poolEditionSize ?? ""}
            onChange={(e) => setPoolEditionSize(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            placeholder="none"
            style={{ width: 100, padding: 4, boxSizing: "border-box", display: "block", marginTop: 4 }}
          />
        </div>
      )}

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
                  value={isOneOff ? Math.min(row.stock, 1) : row.stock}
                  onChange={(e) => updateRow(row.id, { stock: Math.max(0, Number(e.target.value) || 0) })}
                  style={{ width: 70, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
                />
                <label style={{ fontSize: 12, color: "#666" }} title="Original run size for the countdown badge -- leave blank for a regular, non-limited size">
                  Edition
                </label>
                <input
                  type="number"
                  min={0}
                  name={`variantEditionSize-${row.id}`}
                  value={row.editionSize ?? ""}
                  onChange={(e) =>
                    updateRow(row.id, { editionSize: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })
                  }
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
