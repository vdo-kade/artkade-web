"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { deleteVendor } from "./dashboard-actions";

// Hard delete is irreversible, so this asks for more than ActionForm's
// usual window.confirm: the admin has to type the stall's exact name
// before the delete button even enables, then still gets the window.confirm
// from ActionForm's confirmMessage as a second gate.
export default function DeleteVendorButton({ artistId, stallName }: { artistId: string; stallName: string }) {
  const [typed, setTyped] = useState("");
  const [expanded, setExpanded] = useState(false);
  const matches = typed.trim() === stallName;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={{ padding: "4px 10px", fontSize: 12, color: "#b00" }}
      >
        Delete vendor&hellip;
      </button>
    );
  }

  return (
    <ActionForm
      action={deleteVendor}
      confirmMessage={`Permanently delete "${stallName}"? This deletes their products, variants, stall page, and login. This cannot be undone.`}
      successMessage="Vendor deleted."
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
    >
      <input type="hidden" name="artistId" value={artistId} />
      <span style={{ fontSize: 12, color: "#b00" }}>
        Type <strong>{stallName}</strong> to confirm:
      </span>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          // The submit button's `disabled` only blocks click activation --
          // pressing Enter in this text input submits the <form> directly,
          // bypassing that. Block Enter here too so the typed-name gate
          // can't be skipped.
          if (e.key === "Enter" && !matches) e.preventDefault();
        }}
        style={{ padding: 4, fontSize: 12, width: 160 }}
        autoFocus
      />
      <button type="submit" disabled={!matches} style={{ padding: "4px 10px", fontSize: 12, color: "#b00" }}>
        Permanently delete
      </button>
      <button type="button" onClick={() => setExpanded(false)} style={{ padding: "4px 10px", fontSize: 12 }}>
        Cancel
      </button>
    </ActionForm>
  );
}
