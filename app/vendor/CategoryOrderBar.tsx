"use client";

import { useState, useTransition } from "react";
import { updateCategoryOrder } from "./actions";

export type CategoryChip = { key: string; label: string };

function keyOf(chips: CategoryChip[]): string {
  return chips.map((c) => c.key).join(",");
}

// Draggable chips reordering a stall's category sections (artists.
// category_order) -- same drag interaction as ProductImageManager's photo
// gallery and ProductStockGrid's product grid, just a single row instead
// of a grid. Only ever shows categories this stall actually has products
// in; a category added later shows up here (and on the stall page) the
// next time this component's `categories` prop changes, appended by
// lib/catalogue.ts's resolveCategoryOrder rather than requiring the vendor
// to notice and add it manually.
export default function CategoryOrderBar({
  artistId,
  categories,
}: {
  artistId: string;
  categories: CategoryChip[];
}) {
  const [chips, setChips] = useState(categories);
  const [syncedKey, setSyncedKey] = useState(() => keyOf(categories));
  const incomingKey = keyOf(categories);
  if (incomingKey !== syncedKey) {
    setSyncedKey(incomingKey);
    setChips(categories);
  }

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function persist(next: CategoryChip[]) {
    setChips(next);
    setError(null);
    const fd = new FormData();
    fd.set("artistId", artistId);
    next.forEach((c) => fd.append("category", c.key));
    startTransition(async () => {
      const result = await updateCategoryOrder(fd);
      if (result && !result.ok) setError(result.error);
    });
  }

  function handleDrop(dropIndex: number) {
    setOverIndex(null);
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === dropIndex) return;
    const next = [...chips];
    const [moved] = next.splice(from, 1);
    next.splice(dropIndex, 0, moved);
    persist(next);
  }

  if (chips.length <= 1) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>
        Section order on your stall page (drag to reorder)
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {chips.map((chip, index) => (
          <div
            key={chip.key}
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.setData("text/plain", String(index));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIndex !== index) setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(index);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: overIndex === index ? "2px dashed #333" : "1px solid #ccc",
              borderRadius: 16,
              background: "#fff",
              cursor: "grab",
              opacity: dragIndex === index ? 0.4 : 1,
              userSelect: "none",
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>
      {pending && <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Saving…</p>}
      {!pending && error && <p style={{ fontSize: 12, color: "#b00", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
