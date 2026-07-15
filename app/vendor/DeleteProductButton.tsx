"use client";

import { deleteProduct } from "./actions";

export default function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  return (
    <form
      action={deleteProduct}
      onSubmit={(e) => {
        if (!confirm(`Delete "${productName}"? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" style={{ padding: "6px 14px", color: "#b00", border: "1px solid #b00", background: "none" }}>
        Delete
      </button>
    </form>
  );
}
