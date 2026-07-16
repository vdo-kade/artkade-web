"use client";

import { ActionForm } from "@/components/ActionForm";
import { convertToPermanent } from "./dashboard-actions";

export default function ConvertToPermanentButton({ artistId, stallName }: { artistId: string; stallName: string }) {
  return (
    <ActionForm
      action={convertToPermanent}
      confirmMessage={`Convert "${stallName}" to a permanent stall? It will stop expiring and the pop-up dates will be cleared.`}
      successMessage="Converted to permanent."
    >
      <input type="hidden" name="artistId" value={artistId} />
      <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
        Convert to permanent
      </button>
    </ActionForm>
  );
}
