"use client";

import { useState, type ReactNode } from "react";

type TabId = "personal" | "stock" | "tracker" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "personal", label: "Personal info" },
  { id: "stock", label: "Stock" },
  { id: "tracker", label: "Tracker" },
  { id: "account", label: "Account settings" },
];

export default function DashboardTabs({
  personal,
  stock,
  tracker,
  account,
}: {
  personal: ReactNode;
  stock: ReactNode;
  tracker: ReactNode;
  account: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("personal");
  const content = { personal, stock, tracker, account };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #ccc",
          marginBottom: 16,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              border: "none",
              borderBottom: active === tab.id ? "2px solid #333" : "2px solid transparent",
              background: "transparent",
              color: active === tab.id ? "#111" : "#666",
              fontWeight: active === tab.id ? 600 : 400,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {content[active]}
    </div>
  );
}
