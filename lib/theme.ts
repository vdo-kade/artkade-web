// Shared between app/layout.tsx (a Server Component -- the before-paint
// script needs this key baked into its source at build/render time) and
// components/ThemeToggle.tsx (a Client Component). Deliberately NOT
// exported from ThemeToggle.tsx itself: a Server Component importing a
// plain named export from a "use client" module doesn't get the real
// value back (it resolves to an opaque client-reference placeholder,
// serialized as "{}") -- confirmed live, the theme-init script rendered as
// `localStorage.getItem({})` instead of `localStorage.getItem("theme")`
// until this constant moved to its own plain module. Only a "use client"
// file's actual component export gets meaningful cross-boundary
// treatment; everything else it exports needs to live somewhere neutral
// like this to be readable from server code.
export const THEME_STORAGE_KEY = "theme";
