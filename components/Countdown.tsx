"use client";

import { useEffect, useState } from "react";

function format(msLeft: number): string {
  if (msLeft <= 0) return "Ended";
  const s = Math.floor(msLeft / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function Countdown({ endsAt }: { endsAt: string }) {
  const [label, setLabel] = useState(() => format(new Date(endsAt).getTime() - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setLabel(format(new Date(endsAt).getTime() - Date.now()));
    }, 30_000);
    return () => clearInterval(id);
  }, [endsAt]);

  return <span className="font-mono text-xs uppercase tracking-wide">{label}</span>;
}
