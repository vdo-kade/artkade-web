"use client";

import { ActionForm } from "@/components/ActionForm";
import { deletePost } from "./actions";

export default function DeletePostButton({ id, title }: { id: string; title: string }) {
  return (
    <ActionForm action={deletePost} confirmMessage={`Delete "${title}"? This can't be undone.`} successMessage="Deleted.">
      <input type="hidden" name="id" value={id} />
      <button type="submit" style={{ padding: "6px 14px", color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </ActionForm>
  );
}
