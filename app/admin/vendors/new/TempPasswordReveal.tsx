"use client";

import { useState } from "react";
import Link from "next/link";

export default function TempPasswordReveal({
  email,
  tempPassword,
  stallSlug,
}: {
  email: string;
  tempPassword: string;
  stallSlug: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: 16 }}>
      <p style={{ fontWeight: "bold", marginBottom: 12 }}>Stall created.</p>
      <p style={{ fontSize: 13, color: "#b00", marginBottom: 12 }}>
        This password is shown once and can't be retrieved again -- copy it now and send it to the
        vendor.
      </p>
      <p style={{ fontSize: 13, marginBottom: 4 }}>
        Email: <strong>{email}</strong>
      </p>
      <p style={{ fontSize: 13, marginBottom: 12 }}>
        Temp password: <strong style={{ fontFamily: "monospace" }}>{tempPassword}</strong>
      </p>
      <button type="button" onClick={copy} style={{ padding: "6px 14px", marginBottom: 16 }}>
        {copied ? "Copied ✓" : "Copy password"}
      </button>
      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
        <Link href={`/vendor?artist=${stallSlug}`}>Manage this stall &rarr;</Link>
        <Link href="/admin">Back to dashboard &rarr;</Link>
      </div>
    </div>
  );
}
