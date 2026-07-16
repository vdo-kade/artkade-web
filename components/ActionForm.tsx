"use client";

import { useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

// Every Save/Delete form in the app submits through this instead of a bare
// <form action={...}>, so a dead session or a validation failure shows up
// as a real message instead of the page just doing nothing. Calling the
// Server Action directly (rather than only via the `action` prop) still
// goes through Next's normal action-fetch protocol, so redirect() thrown
// inside an action (the dead-session bounce to /admin/login, or
// createProduct/createPost's on-success redirect) is still handled by the
// framework and left to propagate here, uncaught.
export function ActionForm({
  action,
  confirmMessage,
  successMessage = "Saved.",
  resetOnSuccess = false,
  children,
  style,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  confirmMessage?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    setState(null);
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result?.ok && resetOnSuccess) formEl.reset();
    });
  }

  return (
    <form onSubmit={handleSubmit} style={style}>
      {children}
      {pending && <p style={{ fontSize: 13, marginTop: 6, color: "#666" }}>Saving…</p>}
      {!pending && state?.ok === true && (
        <p style={{ fontSize: 13, marginTop: 6, color: "#1a7f37" }}>{successMessage}</p>
      )}
      {!pending && state?.ok === false && (
        <p style={{ fontSize: 13, marginTop: 6, color: "#b00" }}>{state.error}</p>
      )}
    </form>
  );
}
