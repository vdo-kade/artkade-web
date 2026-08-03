// See app/admin/layout.tsx for why -- same reasoning, same fix, applied to
// the other unstyled-inline-hex surface (app/vendor/page.tsx alone has
// 170+ style={{...}} blocks and zero cream/ink/line token usage).
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <div className="light-surface bg-cream min-h-screen">{children}</div>;
}
