"use client";

import { ActionForm } from "@/components/ActionForm";
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
  return (
    <ActionForm action={changePassword} successMessage="Password updated." resetOnSuccess>
      <label style={{ fontSize: 12, color: "#666" }}>New password</label>
      <input style={inputStyle} type="password" name="newPassword" minLength={8} required />
      <label style={{ fontSize: 12, color: "#666" }}>Confirm new password</label>
      <input style={inputStyle} type="password" name="confirmPassword" minLength={8} required />
      <button type="submit" style={{ padding: "6px 14px" }}>
        Change password
      </button>
    </ActionForm>
  );
}
