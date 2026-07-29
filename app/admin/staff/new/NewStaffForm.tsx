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

type CreatedStaff = { email: string; tempPassword: string };

export default function NewStaffForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedStaff | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/admin/staff/create", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create the account.");
      }
      setCreated(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the account.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <TempPasswordReveal email={created.email} tempPassword={created.tempPassword} />;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ fontSize: 12, color: "#666" }}>Email (their login)</label>
      <input style={inputStyle} type="email" name="email" required />

      {error && <p style={{ color: "#b00", marginBottom: 12, fontSize: 13 }}>{error}</p>}

      <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
        {submitting ? "Creating..." : "Create restricted admin"}
      </button>
    </form>
  );
}
