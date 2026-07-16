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

  function handleAddClick() {
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
    <div className="mt-3">
      <div className="flex items-center gap-2">
        {variants.length > 1 && (
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="appearance-none border border-line text-xs pl-2 pr-6 py-1.5 bg-white bg-no-repeat flex-1 min-w-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%231C1712' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundPosition: "right 0.5rem center",
              backgroundSize: "10px",
            }}
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
          onClick={handleAddClick}
          disabled={soldOut}
          className="shrink-0 bg-ink text-white text-xs font-medium px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {added ? "Added ✓" : soldOut ? "Sold out" : "Add to bag"}
        </button>
      </div>
    </div>
  );
}
