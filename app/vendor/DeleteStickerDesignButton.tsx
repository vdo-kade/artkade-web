"use client";

import { deleteStickerDesign } from "./actions";

export default function DeleteStickerDesignButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteStickerDesign}
      onSubmit={(e) => {
        if (!confirm(`Delete the "${name}" design? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" style={{ padding: "3px 8px", fontSize: 12, color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </form>
  );
}
