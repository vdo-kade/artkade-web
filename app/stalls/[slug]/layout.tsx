import type { ReactNode } from "react";

// Wires up the @modal parallel slot for the product detail
// intercepting route (see app/stalls/[slug]/@modal). `modal` renders
// whatever the current navigation matched there -- the interceptor's
// overlay on a soft nav from within this stall page, or @modal/default.tsx
// (null) on a direct load/refresh of /stalls/[slug]/products/[productSlug],
// where `children` alone renders the real full page instead.
export default function StallLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
