"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide"
      style={{ padding: "8px 16px", fontSize: 14, marginBottom: 16 }}
    >
      Print label
    </button>
  );
}
