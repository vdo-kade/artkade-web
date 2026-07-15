"use client";

import { deletePost } from "./actions";

export default function DeletePostButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deletePost}
      onSubmit={(e) => {
        if (!confirm(`Delete "${title}"? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" style={{ padding: "6px 14px", color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </form>
  );
}
