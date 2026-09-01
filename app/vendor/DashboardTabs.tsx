"use client";

import { useState, type ReactNode } from "react";

type TabId = "personal" | "stock" | "freebies" | "tracker" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "personal", label: "Personal info" },
  { id: "stock", label: "Stock" },
  { id: "freebies", label: "Freebies" },
  { id: "tracker", label: "Tracker" },
  { id: "account", label: "Account settings" },
];

export default function DashboardTabs({
  personal,
  stock,
  freebies,
  tracker,
  account,
}: {
  personal: ReactNode;
  stock: ReactNode;
  freebies: ReactNode;
  tracker: ReactNode;
  account: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("personal");
  const content = { personal, stock, freebies, tracker, account };

  return (
    <div>
      {/* overflowX:auto + flexShrink:0/whiteSpace:nowrap on each button below
          is what makes this a real scrollable strip instead of letting
          buttons shrink below their content width -- flex items default to
          min-width:auto (their min-content size), so without those two, a
          narrow viewport was squeezing "Account settings" down until its
          own label wrapped across lines, making that one button taller
          than the rest and throwing off its underline indicator (each
          tab's active-state border lives on the button itself, not the
          container, so equal single-line height across every button is
          what keeps them aligned). Scrolling, not shrinking, is the fix at
          any width -- this isn't a mobile-only style. */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #ccc",
          marginBottom: 16,
          overflowX: "auto",
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
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* key={active} forces a full unmount/remount of the previous tab's
          subtree on every switch -- without it, this was the real cause of
          the "Add a product" Name field (and "Add a freebie" Title field)
          arriving pre-filled with the stall's own name. It was never
          browser autofill (confirmed live: the affected input didn't match
          :-webkit-autofill at all): with no key, {"{content[active]}"}
          swapping from one tab's element tree to another's is just a prop
          update to React, not a new element, and its diffing matches
          elements by type+position, not by which tab they logically belong
          to. Both the Personal-info tab's Name input (a real, legitimate
          defaultValue={"{artist.name}"}) and the Add-a-product tab's Name
          input are plain <input>s at the same tree position inside the
          same ActionForm-shaped subtree -- so React reused the *same* DOM
          node for both, and while it re-applies props like name/style, it
          never resets an uncontrolled input's live .value on update
          (defaultValue only ever applies once, at creation). The old
          field's real value just carried over onto whatever unrelated
          field happened to land in the same slot next. This affects every
          input at a shared tree position across tabs, not just the two
          reported here -- a stable key per tab is the complete fix, not a
          per-field patch. */}
      <div key={active}>{content[active]}</div>
    </div>
  );
}
