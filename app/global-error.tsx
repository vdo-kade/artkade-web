"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", background: "#F7F1E6", color: "#1C1712" }}>
        <section style={{ maxWidth: 480, margin: "0 auto", padding: "6rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: 28, marginBottom: 16 }}>Art Kade hit a snag</h1>
          <p style={{ color: "#726A5E", marginBottom: 32 }}>
            Something went wrong loading the site. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#1C1712",
              color: "#fff",
              padding: "0.75rem 1.75rem",
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </section>
      </body>
    </html>
  );
}
