import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { recordOfflineSale } from "../mode-actions";
import EndOfDayPanel from "./EndOfDayPanel";
import AdminNav from "@/components/AdminNav";

export const revalidate = 0;

type ArtistRow = { id: string; slug: string; name: string };
type VariantRow = { id: string; label: string; price: number; stock: number };
type ProductRow = { id: string; name: string; category: string; product_variants: VariantRow[] };
type SaleRow = {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  sold_at: string;
  products: { name: string } | null;
  product_variants: { label: string } | null;
};

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

function VendorModeError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load Vendor Mode. Check the server logs for details.</p>
    </div>
  );
}

export default async function VendorModePage({ searchParams }: { searchParams: { artist?: string } }) {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <VendorModeError />;
  }

  let stallList: ArtistRow[] = [];
  let selectedArtistId: string;

  if (session.role === "admin") {
    const { data } = await supabase.from("artists").select("id, slug, name").order("sort_order");
    stallList = data ?? [];
    if (stallList.length === 0) {
      return <div style={{ padding: 24, fontFamily: "sans-serif" }}>No stalls yet.</div>;
    }
    const requested = stallList.find((s) => s.slug === searchParams.artist);
    selectedArtistId = (requested ?? stallList[0]).id;
  } else {
    selectedArtistId = session.artistId;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [artistResult, productsResult, todaySalesResult] = await Promise.all([
    supabase.from("artists").select("id, slug, name").eq("id", selectedArtistId).maybeSingle<ArtistRow>(),
    supabase
      .from("products")
      .select("id, name, category, product_variants(id, label, price, stock)")
      .eq("artist_id", selectedArtistId)
      .eq("is_active", true)
      .order("sort_order")
      .returns<ProductRow[]>(),
    supabase
      .from("offline_sales")
      .select("id, quantity, unit_price, notes, sold_at, products(name), product_variants(label)")
      .eq("artist_id", selectedArtistId)
      .gte("sold_at", startOfToday.toISOString())
      .order("sold_at", { ascending: false })
      .returns<SaleRow[]>(),
  ]);

  if (artistResult.error || productsResult.error || todaySalesResult.error) {
    console.error(
      "Failed to load Vendor Mode data:",
      artistResult.error ?? productsResult.error ?? todaySalesResult.error
    );
    return <VendorModeError />;
  }

  const artist = artistResult.data;
  if (!artist) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Stall not found.</div>;
  }
  const products = productsResult.data ?? [];
  const todaySales = todaySalesResult.data ?? [];
  const todayTotal = todaySales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);

  return (
    <>
      <AdminNav role={session.role} />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 560, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/vendor">&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>{artist.name} — Vendor Mode</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Tap "Sold" for an in-person sale at an event. Stock decrements immediately -- this is not a
        customer order, no shipping or payment proof.
      </p>

      {session.role === "admin" && stallList.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {stallList.map((s) => (
            <a
              key={s.id}
              href={`/vendor/mode?artist=${s.slug}`}
              style={{
                padding: "4px 10px",
                fontSize: 13,
                border: "1px solid #ccc",
                borderRadius: 4,
                textDecoration: "none",
                color: s.id === selectedArtistId ? "#fff" : "#333",
                background: s.id === selectedArtistId ? "#333" : "transparent",
              }}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Log a sale</h2>
        {products.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>No active products.</p>}
        {products.map((product) => (
          <div key={product.id} style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
            <strong>{product.name}</strong>
            {product.product_variants.map((v) => (
              <form
                action={recordOfflineSale}
                key={v.id}
                style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}
              >
                <input type="hidden" name="artistId" value={artist.id} />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="variantId" value={v.id} />
                <span style={{ fontSize: 13, flex: "1 1 160px" }}>
                  {v.label} — Rs. {v.price.toLocaleString("en-US")} — {v.stock} in stock
                </span>
                <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 56, padding: 4 }} />
                <input
                  type="text"
                  name="notes"
                  placeholder="Note (optional)"
                  style={{ width: 140, padding: 4, fontSize: 12 }}
                />
                <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }} disabled={v.stock <= 0}>
                  {v.stock <= 0 ? "Sold out" : "Sold"}
                </button>
              </form>
            ))}
          </div>
        ))}
      </section>

      <EndOfDayPanel sales={todaySales} total={todayTotal} />
      </div>
    </>
  );
}
