// Keeps the admin dashboard fully light regardless of the site-wide dark
// mode toggle -- it's built entirely with inline hex styles (see AdminNav,
// OrderGrid, StatusHistory, WeeklyOrders, this whole directory) with zero
// use of the cream/ink/line tokens, so retrofitting it to actually theme
// was ruled out as too messy/risky for this pass (170+ inline style blocks
// in the vendor dashboard alone, zero token usage found anywhere in
// app/admin or app/vendor). Without this wrapper, the root layout's
// <body> background/text would still flip to dark underneath this
// unstyled content whenever dark mode is on, which is the "half-themed"
// outcome explicitly worse than not theming it at all -- this pins the
// same three tokens .light-surface pins everywhere else in the app, just
// applied once here instead of once per admin element.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="light-surface bg-cream min-h-screen">{children}</div>;
}
