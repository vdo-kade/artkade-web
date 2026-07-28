"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { FREEBIE_CATEGORY_LABELS, FREEBIE_CATEGORY_ORDER } from "@/lib/freebies";
import { updateFreebie } from "./actions";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
};

export type EditableFreebie = {
  id: string;
  title: string;
  description: string | null;
  category: string;
};

// Collapsed by default (same "click to reveal the form" pattern as the
// Stock tab's product grid) -- previously freebies could only be created
// or deleted, so fixing a typo meant deleting and recreating the whole
// thing, losing whatever direct links pointed at its file/thumbnail URLs.
export default function FreebieEditToggle({ freebie }: { freebie: EditableFreebie }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} style={{ padding: "6px 14px", fontSize: 13 }}>
        Edit
      </button>
    );
  }

  return (
    <ActionForm action={updateFreebie} successMessage="Freebie updated." onSuccess={() => setEditing(false)}>
      <input type="hidden" name="freebieId" value={freebie.id} />
      <label style={{ fontSize: 12, color: "#666" }}>Title</label>
      <input style={inputStyle} name="title" defaultValue={freebie.title} required />
      <label style={{ fontSize: 12, color: "#666" }}>Description</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} name="description" defaultValue={freebie.description ?? ""} />
      <label style={{ fontSize: 12, color: "#666" }}>Category</label>
      <select style={inputStyle} name="category" defaultValue={freebie.category} required>
        {FREEBIE_CATEGORY_ORDER.map((cat) => (
          <option key={cat} value={cat}>
            {FREEBIE_CATEGORY_LABELS[cat]}
          </option>
        ))}
      </select>
      <label style={{ fontSize: 12, color: "#666" }}>Replace file (optional)</label>
      <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="file" />
      <label style={{ fontSize: 12, color: "#666" }}>Replace thumbnail (optional)</label>
      <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="thumbnail" accept="image/*" />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={{ padding: "6px 14px" }}>
          Save changes
        </button>
        <button type="button" onClick={() => setEditing(false)} style={{ padding: "6px 14px" }}>
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}
