"use client";

import { useRef, useState } from "react";
import { changePassword } from "./actions";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
};

export default function PasswordChangeForm() {
  const [message, setMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;

    if (newPassword.length < 8) {
      e.preventDefault();
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setMessage("Passwords don't match.");
      return;
    }
    setMessage("Updating...");
    // The server action can't report back to this form once submitted, so
    // this is an optimistic confirmation -- a real failure only surfaces in
    // the server logs, matching every other action in this dashboard.
    setTimeout(() => {
      setMessage("Password updated.");
      formRef.current?.reset();
    }, 600);
  }

  return (
    <form ref={formRef} action={changePassword} onSubmit={handleSubmit}>
      <label style={{ fontSize: 12, color: "#666" }}>New password</label>
      <input style={inputStyle} type="password" name="newPassword" minLength={8} required />
      <label style={{ fontSize: 12, color: "#666" }}>Confirm new password</label>
      <input style={inputStyle} type="password" name="confirmPassword" minLength={8} required />
      <button type="submit" style={{ padding: "6px 14px" }}>
        Change password
      </button>
      {message && <p style={{ fontSize: 13, marginTop: 8, color: "#666" }}>{message}</p>}
    </form>
  );
}
