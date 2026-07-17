"use client";

import { ActionForm } from "@/components/ActionForm";
import { deleteFreebie } from "./actions";

export default function DeleteFreebieButton({ freebieId, freebieTitle }: { freebieId: string; freebieTitle: string }) {
  return (
    <ActionForm action={deleteFreebie} confirmMessage={`Delete "${freebieTitle}"? This can't be undone.`} successMessage="Deleted.">
      <input type="hidden" name="freebieId" value={freebieId} />
      <button type="submit" style={{ padding: "6px 14px", color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </ActionForm>
  );
}
