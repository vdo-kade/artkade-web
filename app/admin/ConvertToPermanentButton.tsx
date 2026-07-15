"use client";

import { convertToPermanent } from "./dashboard-actions";

export default function ConvertToPermanentButton({ artistId, stallName }: { artistId: string; stallName: string }) {
  return (
    <form
      action={convertToPermanent}
      onSubmit={(e) => {
        if (!confirm(`Convert "${stallName}" to a permanent stall? It will stop expiring and the pop-up dates will be cleared.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="artistId" value={artistId} />
      <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
        Convert to permanent
      </button>
    </form>
  );
}
