"use client";

import { useState, type FormEvent } from "react";
import TempPasswordReveal from "./TempPasswordReveal";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
};

type CreatedVendor = { slug: string; email: string; tempPassword: string };

export default function NewVendorForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedVendor | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/admin/vendors/create", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create the vendor.");
      }
      setCreated(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the vendor.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <TempPasswordReveal email={created.email} tempPassword={created.tempPassword} stallSlug={created.slug} />;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ fontSize: 12, color: "#666" }}>Stall name</label>
      <input style={inputStyle} name="name" required />

      <label style={{ fontSize: 12, color: "#666" }}>Tagline</label>
      <input style={inputStyle} name="tagline" />

      <label style={{ fontSize: 12, color: "#666" }}>Bio</label>
      <textarea style={{ ...inputStyle, minHeight: 90 }} name="bio" />

      <label style={{ fontSize: 12, color: "#666" }}>Vendor's email (their login)</label>
      <input style={inputStyle} type="email" name="email" required />

      <label style={{ fontSize: 12, color: "#666" }}>Logo</label>
      <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="logo" accept="image/*" />

      <label style={{ fontSize: 12, color: "#666" }}>Hero image</label>
      <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="hero" accept="image/*" />

      <label style={{ fontSize: 12, color: "#666" }}>Pop-up starts at</label>
      <input style={inputStyle} type="datetime-local" name="popupStartsAt" required />

      <label style={{ fontSize: 12, color: "#666" }}>Pop-up ends at</label>
      <input style={inputStyle} type="datetime-local" name="popupEndsAt" required />

      {error && <p style={{ color: "#b00", marginBottom: 12, fontSize: 13 }}>{error}</p>}

      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Creating..." : "Create pop-up vendor"}
      </button>
    </form>
  );
}
