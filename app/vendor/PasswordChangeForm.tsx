"use client";

import { useRouter } from "next/navigation";
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

// redirectOnSuccess is only passed by the forced /vendor/change-password
// path (a vendor still on their TempPasswordReveal-issued password) --
// the normal Account-tab usage in app/vendor/page.tsx omits it, since
// there's nowhere more useful to send someone who's already in the
// dashboard and just changing their password voluntarily.
export default function PasswordChangeForm({ redirectOnSuccess }: { redirectOnSuccess?: string }) {
  const router = useRouter();
  return (
    <ActionForm
      action={changePassword}
      successMessage="Password updated."
      resetOnSuccess
      onSuccess={redirectOnSuccess ? () => router.push(redirectOnSuccess) : undefined}
    >
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
