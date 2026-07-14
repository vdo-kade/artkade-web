"use client";

import { useState } from "react";
import { useBag } from "./BagProvider";
import type { ProductVariant } from "./ProductCard";

export default function AddToBagButton({
  productId,
  productName,
  imageUrl,
  variants,
}: {
  productId: string;
  productName: string;
  imageUrl?: string;
  variants: ProductVariant[];
}) {
  const { addItem } = useBag();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === variantId) ?? variants[0];
  const soldOut = selected.stock <= 0;

  function handleAdd() {
    if (soldOut) return;
    addItem({
      productId,
      variantId: selected.id,
      productName,
      variantLabel: selected.label,
      unitPrice: selected.price,
      imageUrl,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      {variants.length > 1 && (
        <select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className="border border-line text-xs px-2 py-1.5 bg-white flex-1 min-w-0"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.stock <= 0}>
              {v.label} — Rs. {v.price.toLocaleString("en-US")}
              {v.stock <= 0 ? " (sold out)" : ""}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={handleAdd}
        disabled={soldOut}
        className="shrink-0 bg-ink text-white text-xs font-medium px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {added ? "Added ✓" : soldOut ? "Sold out" : "Add to bag"}
      </button>
    </div>
  );
}
