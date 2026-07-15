"use client";

import { useState } from "react";
import { useBag } from "./BagProvider";
import { createClient } from "@/lib/supabase";
import type { ProductVariant } from "./ProductCard";

type Design = { id: string; name: string; image_url: string | null };

export default function AddToBagButton({
  productId,
  artistId,
  productName,
  imageUrl,
  variants,
}: {
  productId: string;
  artistId: string;
  productName: string;
  imageUrl?: string;
  variants: ProductVariant[];
}) {
  const { addItem } = useBag();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [selectedDesignIds, setSelectedDesignIds] = useState<string[]>([]);

  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === variantId) ?? variants[0];
  const soldOut = selected.stock <= 0;
  const packSize = selected.packSize;

  function addPlain() {
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

  async function openPicker() {
    setPickerOpen(true);
    setSelectedDesignIds([]);
    if (designs !== null) return;
    setLoadingDesigns(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("sticker_designs")
      .select("id, name, image_url")
      .eq("artist_id", artistId)
      .eq("is_active", true)
      .order("sort_order");
    setDesigns(data ?? []);
    setLoadingDesigns(false);
  }

  function toggleDesign(id: string) {
    setSelectedDesignIds((prev) => {
      if (prev.includes(id)) return prev.filter((d) => d !== id);
      if (packSize && prev.length >= packSize) return prev;
      return [...prev, id];
    });
  }

  function confirmPack() {
    if (!packSize || selectedDesignIds.length !== packSize || !designs) return;
    const stickerSelection = designs
      .filter((d) => selectedDesignIds.includes(d.id))
      .map((d) => ({ id: d.id, name: d.name }));
    addItem({
      productId,
      variantId: selected.id,
      productName,
      variantLabel: selected.label,
      unitPrice: selected.price,
      imageUrl,
      stickerSelection,
    });
    setPickerOpen(false);
    setSelectedDesignIds([]);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  function handleAddClick() {
    if (soldOut) return;
    if (packSize) {
      openPicker();
    } else {
      addPlain();
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        {variants.length > 1 && (
          <select
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setPickerOpen(false);
            }}
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
          onClick={handleAddClick}
          disabled={soldOut}
          className="shrink-0 bg-ink text-white text-xs font-medium px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {added ? "Added ✓" : soldOut ? "Sold out" : packSize ? "Pick designs" : "Add to bag"}
        </button>
      </div>

      {pickerOpen && packSize && (
        <div className="mt-2 border border-line bg-white p-3">
          <p className="text-xs font-mono uppercase mb-2">
            Pick {packSize} design{packSize === 1 ? "" : "s"} ({selectedDesignIds.length}/{packSize})
          </p>
          {loadingDesigns && <p className="text-xs text-warm-grey">Loading designs...</p>}
          {!loadingDesigns && designs && designs.length === 0 && (
            <p className="text-xs text-warm-grey">No designs available for this stall yet.</p>
          )}
          {!loadingDesigns && designs && designs.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {designs.map((d) => {
                const isSelected = selectedDesignIds.includes(d.id);
                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => toggleDesign(d.id)}
                    className={`aspect-square border-2 overflow-hidden ${isSelected ? "border-accent" : "border-line"}`}
                    title={d.name}
                  >
                    {d.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image_url} alt={d.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-warm-grey">{d.name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmPack}
              disabled={selectedDesignIds.length !== packSize}
              className="bg-ink text-white text-xs font-medium px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add to bag
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-xs text-warm-grey px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
