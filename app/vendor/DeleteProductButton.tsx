"use client";

import { ActionForm } from "@/components/ActionForm";
import { deleteProduct } from "./actions";

export default function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  return (
    <ActionForm action={deleteProduct} confirmMessage={`Delete "${productName}"? This can't be undone.`} successMessage="Deleted.">
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" style={{ padding: "6px 14px", color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </ActionForm>
  );
}
