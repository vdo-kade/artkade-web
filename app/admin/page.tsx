import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";
import { logout } from "./actions";
import { extendPopup, reactivateStall, checkExpiryNow } from "./dashboard-actions";
import ConvertToPermanentButton from "./ConvertToPermanentButton";
import DeleteVendorButton from "./DeleteVendorButton";
import Countdown from "@/components/Countdown";
import AdminNav from "@/components/AdminNav";
import { ActionForm } from "@/components/ActionForm";

export const revalidate = 0;

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  is_popup: boolean;
  popup_starts_at: string | null;
  popup_ends_at: string | null;
};

type ProductForSummary = {
  id: string;
  artist_id: string;
  product_variants: { stock: number }[];
};

type PendingOrderRow = {
  id: string;
  order_items: { product_id: string }[];
};

const inputStyle: React.CSSProperties = {
  padding: 6,
  fontSize: 13,
};

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Never render a raw error/exception message in this page's JSX -- see the
// identical note on app/vendor/page.tsx and app/admin/orders/page.tsx.
function GodDashboardError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load the dashboard. Check the server logs for details.</p>
    </div>
  );
}

type Status = "active" | "active-popup" | "scheduled" | "archived-popup" | "inactive";

function computeStatus(artist: ArtistRow, now: Date): Status {
  if (artist.is_active) return artist.is_popup ? "active-popup" : "active";
  if (artist.is_popup && artist.popup_starts_at && new Date(artist.popup_starts_at) > now) return "scheduled";
  if (artist.is_popup) return "archived-popup";
  return "inactive";
}

const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  "active-popup": "Active pop-up",
  scheduled: "Scheduled",
  "archived-popup": "Archived (pop-up ended)",
  inactive: "Inactive",
};

const STATUS_COLORS: Record<Status, string> = {
  active: "green",
  "active-popup": "green",
  scheduled: "#a06a00",
  "archived-popup": "#999",
  inactive: "#999",
};

export default async function GodDashboardPage() {
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <GodDashboardError />;
  }

  // Applies any due activate/archive transitions before rendering, so a
  // stall whose window just opened or closed shows correctly on this same
  // load -- the same shared tick the cron route and "check now" use.
  try {
    await runPopupLifecycleTick(supabase);
  } catch (err) {
    console.error("Popup lifecycle tick failed on dashboard load:", err);
  }

  const [artistsResult, productsResult, pendingOrdersResult] = await Promise.all([
    supabase
      .from("artists")
      .select("id, slug, name, is_active, is_popup, popup_starts_at, popup_ends_at")
      .order("sort_order")
      .returns<ArtistRow[]>(),
    supabase.from("products").select("id, artist_id, product_variants(stock)").returns<ProductForSummary[]>(),
    supabase
      .from("orders")
      .select("id, order_items(product_id)")
      .eq("status", "awaiting_review")
      .returns<PendingOrderRow[]>(),
  ]);

  if (artistsResult.error) {
    console.error("Failed to load artists:", artistsResult.error);
    return <GodDashboardError />;
  }
  if (productsResult.error) {
    console.error("Failed to load products:", productsResult.error);
    return <GodDashboardError />;
  }
  if (pendingOrdersResult.error) {
    console.error("Failed to load pending orders:", pendingOrdersResult.error);
    return <GodDashboardError />;
  }

  const artists = artistsResult.data ?? [];
  const products = productsResult.data ?? [];
  const pendingOrders = pendingOrdersResult.data ?? [];

  const stockByArtist = new Map<string, number>();
  const productArtistMap = new Map<string, string>();
  for (const p of products) {
    productArtistMap.set(p.id, p.artist_id);
    const sum = p.product_variants.reduce((s, v) => s + v.stock, 0);
    stockByArtist.set(p.artist_id, (stockByArtist.get(p.artist_id) ?? 0) + sum);
  }

  const pendingOrderIdsByArtist = new Map<string, Set<string>>();
  for (const order of pendingOrders) {
    const artistIdsInOrder = new Set(
      order.order_items.map((oi) => productArtistMap.get(oi.product_id)).filter((id): id is string => !!id)
    );
    for (const artistId of artistIdsInOrder) {
      if (!pendingOrderIdsByArtist.has(artistId)) pendingOrderIdsByArtist.set(artistId, new Set());
      pendingOrderIdsByArtist.get(artistId)!.add(order.id);
    }
  }

  const now = new Date();

  return (
    <>
      <AdminNav role="admin" />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24 }}>All stalls</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#666" }}>
          <Link href="/admin/orders">Orders &rarr;</Link>
          <Link href="/admin/magazine">Magazine &rarr;</Link>
          <form action={logout}>
            <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }}>
              Log out
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Link
          href="/admin/vendors/new"
          style={{ padding: "6px 14px", background: "#333", color: "#fff", textDecoration: "none", fontSize: 13 }}
        >
          + Add pop-up vendor
        </Link>
        <ActionForm action={checkExpiryNow} successMessage="Checked.">
          <button type="submit" style={{ padding: "6px 14px", fontSize: 13 }}>
            Check expiry now
          </button>
        </ActionForm>
      </div>

      {artists.length === 0 && <p>No stalls yet.</p>}

      {artists.map((artist) => {
        const status = computeStatus(artist, now);
        const stock = stockByArtist.get(artist.id) ?? 0;
        const pendingCount = pendingOrderIdsByArtist.get(artist.id)?.size ?? 0;

        return (
          <div key={artist.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>{artist.name}</strong>
              <span
                style={{
                  color: STATUS_COLORS[status],
                  textTransform: "uppercase",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>

            {status === "active-popup" && artist.popup_ends_at && (
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                <Countdown endsAt={artist.popup_ends_at} />
              </p>
            )}
            {status === "scheduled" && artist.popup_starts_at && (
              <p style={{ fontSize: 13, marginBottom: 8, color: "#a06a00" }}>
                Starts {new Date(artist.popup_starts_at).toLocaleString()}
              </p>
            )}

            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              {stock} unit{stock === 1 ? "" : "s"} in stock · {pendingCount} pending order
              {pendingCount === 1 ? "" : "s"}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Link href={`/vendor?artist=${artist.slug}`} style={{ fontSize: 13 }}>
                Manage &rarr;
              </Link>

              {status === "scheduled" && (
                <ActionForm action={reactivateStall} successMessage="Activated.">
                  <input type="hidden" name="artistId" value={artist.id} />
                  <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
                    Activate now
                  </button>
                </ActionForm>
              )}

              {(status === "active-popup" || status === "archived-popup") && (
                <ActionForm
                  action={extendPopup}
                  successMessage="Extended."
                  style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
                >
                  <input type="hidden" name="artistId" value={artist.id} />
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    name="newPopupEndsAt"
                    defaultValue={toDatetimeLocal(artist.popup_ends_at)}
                    required
                  />
                  <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
                    {status === "archived-popup" ? "Reactivate with new end date" : "Extend"}
                  </button>
                </ActionForm>
              )}

              {(status === "active-popup" || status === "scheduled" || status === "archived-popup") && (
                <ConvertToPermanentButton artistId={artist.id} stallName={artist.name} />
              )}

              {status === "inactive" && (
                <ActionForm action={reactivateStall} successMessage="Reactivated.">
                  <input type="hidden" name="artistId" value={artist.id} />
                  <button type="submit" style={{ padding: "4px 10px", fontSize: 12 }}>
                    Reactivate
                  </button>
                </ActionForm>
              )}

              <DeleteVendorButton artistId={artist.id} stallName={artist.name} />
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
