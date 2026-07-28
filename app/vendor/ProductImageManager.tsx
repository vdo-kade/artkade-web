"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { addProductImage, deleteProductImage, reorderProductImages } from "./actions";

export type GalleryImage = { id: string; url: string };

function keyOf(images: GalleryImage[]): string {
  return images.map((i) => i.id).join(",");
}

// Thumbnail grid + drag-to-reorder + delete + multi-upload for a single
// product's gallery (product_images). The first tile is always what
// products.image_url points at -- the card/hero image shown everywhere
// sitewide -- so every mutation here (add/delete/reorder, see ./actions)
// re-syncs that column server-side; this component only ever needs to
// render the gallery, never touch image_url itself.
export default function ProductImageManager({
  productId,
  images,
}: {
  productId: string;
  images: GalleryImage[];
}) {
  // Mirrors `images` into local state so drag-reorder can show an instant
  // preview before the server round-trip resolves. Every mutation below
  // persists immediately (no separate "save" step), so there's never a
  // local-only edit that a fresh `images` prop should be prevented from
  // overwriting -- safe to resync whenever the incoming prop actually
  // changes (tracked via this id-based key, not object identity, since the
  // parent server component creates a new array on every render).
  const [items, setItems] = useState(images);
  const [syncedKey, setSyncedKey] = useState(() => keyOf(images));
  const incomingKey = keyOf(images);
  if (incomingKey !== syncedKey) {
    setSyncedKey(incomingKey);
    setItems(images);
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function persistOrder(next: GalleryImage[]) {
    setItems(next);
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    next.forEach((img) => fd.append("imageId", img.id));
    startTransition(async () => {
      const result = await reorderProductImages(fd);
      if (result && !result.ok) setError(result.error);
    });
  }

  function handleDrop(dropIndex: number) {
    setOverIndex(null);
    const fromIndex = dragIndex;
    setDragIndex(null);
    if (fromIndex === null || fromIndex === dropIndex) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    persistOrder(next);
  }

  function handleDelete(imageId: string) {
    if (items.length <= 1) return;
    if (!window.confirm("Remove this photo?")) return;
    const prev = items;
    setItems(items.filter((i) => i.id !== imageId));
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("imageId", imageId);
    startTransition(async () => {
      const result = await deleteProductImage(fd);
      if (result && !result.ok) {
        setError(result.error);
        setItems(prev);
      }
    });
  }

  function handleAdd(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList);
    startTransition(async () => {
      // One request per file, sequentially -- not a single batched upload.
      // Bundling several photos into one request risks Vercel's ~4.3MB
      // whole-request ceiling (see addProductImage's own comment), and
      // sequential calls also avoid two inserts racing to compute the same
      // "next sort_order". Stops at the first failure so a vendor sees
      // exactly which photo didn't make it rather than a vague batch error.
      for (const file of files) {
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("photo", file);
        const result = await addProductImage(fd);
        if (result && !result.ok) {
          setError(result.error);
          return;
        }
      }
    });
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
        Photos (drag to reorder -- first is the cover photo shown everywhere)
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {items.map((img, index) => (
          <div
            key={img.id}
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
              position: "relative",
              width: 88,
              height: 88,
              border: overIndex === index ? "2px dashed #333" : "1px solid #ccc",
              borderRadius: 4,
              overflow: "hidden",
              cursor: "grab",
              opacity: dragIndex === index ? 0.4 : 1,
              flexShrink: 0,
              background: "#f2f2f2",
            }}
          >
            <Image src={img.url} alt="" fill sizes="88px" style={{ objectFit: "cover" }} />
            {index === 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  fontSize: 9,
                  background: "#1a7f37",
                  color: "#fff",
                  padding: "1px 4px",
                  borderRadius: 2,
                }}
              >
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => handleDelete(img.id)}
              disabled={items.length <= 1}
              title={items.length <= 1 ? "A product needs at least one photo" : "Remove photo"}
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 18,
                height: 18,
                lineHeight: "16px",
                fontSize: 12,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "none",
                borderRadius: 2,
                cursor: items.length <= 1 ? "not-allowed" : "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          handleAdd(e.target.files);
          e.target.value = "";
        }}
        style={{ fontSize: 12 }}
      />
      {pending && <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Saving…</p>}
      {!pending && error && <p style={{ fontSize: 12, color: "#b00", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
