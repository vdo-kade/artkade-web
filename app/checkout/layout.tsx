import type { Metadata } from "next";

// page.tsx is a client component ("use client"), which can't export its
// own metadata -- this layout is the only place left to set it.
export const metadata: Metadata = {
  title: "Checkout — Art Kade",
  alternates: { canonical: "/checkout" },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
