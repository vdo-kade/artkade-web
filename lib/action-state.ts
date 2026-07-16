// Shared result shape for every mutating Server Action in this app so a
// form can show whether Save actually worked instead of no-opping in
// silence (see components/ActionForm.tsx, which every form in this app now
// submits through). `null` is the pre-submission state; actions that
// redirect on success (createProduct, createPost) never need to return
// `{ ok: true }` since the redirect itself leaves the page.
export type ActionState = { ok: true } | { ok: false; error: string } | null;

export const IDLE_ACTION_STATE: ActionState = null;
