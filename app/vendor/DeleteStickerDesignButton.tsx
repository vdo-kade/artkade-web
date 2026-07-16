"use client";

import { ActionForm } from "@/components/ActionForm";
import { deleteStickerDesign } from "./actions";

export default function DeleteStickerDesignButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionForm action={deleteStickerDesign} confirmMessage={`Delete the "${name}" design? This can't be undone.`} successMessage="Deleted.">
      <input type="hidden" name="id" value={id} />
      <button type="submit" style={{ padding: "3px 8px", fontSize: 12, color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </ActionForm>
  );
}
