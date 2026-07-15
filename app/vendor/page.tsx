import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { logout } from "@/app/admin/actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/catalogue";
import {
  updateStallDetails,
  uploadStallPhoto,
  createProduct,
  updateProduct,
} from "./actions";
import DeleteProductButton from "./DeleteProductButton";
import PasswordChangeForm from "./PasswordChangeForm";

export const revalidate = 0;

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  is_popup: boolean;
  popup_starts_at: string | null;
  popup_ends_at: string | null;
};

type VariantRow = { id: string; label: string; price: number; stock: number };
type ProductRow = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  is_one_off: boolean;
  sold_count: number;
  product_variants: VariantRow[];
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
};

const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the viewer's
// local time; this renders the stored UTC timestamp using the server's
// local time, which is an accepted simplification for this dashboard's
// single-timezone use (see app/vendor/actions.ts for the reverse conversion).
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Never render a raw error/exception message in this page's JSX -- it's a
// Server Component, so anything here becomes part of the HTML sent to the
// browser. Internal client-library errors (e.g. a malformed key breaking
// header construction) can embed sensitive values like the service role
// key in their message. Log full detail server-side only; the page only
// ever shows a fixed, safe string.
function VendorDashboardError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load the dashboard. Check the server logs for details.</p>
    </div>
  );
}

export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: { artist?: string };
}) {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <VendorDashboardError />;
  }

  const authClient = await createAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  let stallList: Pick<ArtistRow, "id" | "slug" | "name">[] = [];
  let selectedArtistId: string;

  if (session.role === "admin") {
    const { data, error: stallListError } = await supabase
      .from("artists")
      .select("id, slug, name")
      .order("sort_order");
    if (stallListError) {
      console.error("Failed to load stall list:", stallListError);
      return <VendorDashboardError />;
    }
    stallList = data ?? [];
    if (stallList.length === 0) {
      return <div style={{ padding: 24, fontFamily: "sans-serif" }}>No stalls yet.</div>;
    }
    const requested = stallList.find((s) => s.slug === searchParams.artist);
    selectedArtistId = (requested ?? stallList[0]).id;
  } else {
    selectedArtistId = session.artistId;
  }

  const [artistResult, productsResult] = await Promise.all([
    supabase
      .from("artists")
      .select("id, slug, name, tagline, bio, logo_url, hero_image_url, is_popup, popup_starts_at, popup_ends_at")
      .eq("id", selectedArtistId)
      .maybeSingle<ArtistRow>(),
    supabase
      .from("products")
      .select(
        "id, category, name, description, image_url, is_active, is_one_off, sold_count, product_variants(id, label, price, stock)"
      )
      .eq("artist_id", selectedArtistId)
      .order("sort_order")
      .returns<ProductRow[]>(),
  ]);

  if (artistResult.error) {
    console.error("Failed to load artist:", artistResult.error);
    return <VendorDashboardError />;
  }
  if (productsResult.error) {
    console.error("Failed to load products:", productsResult.error);
    return <VendorDashboardError />;
  }

  const artist = artistResult.data;
  const products = productsResult.data;

  if (!artist) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Stall not found.</div>;
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24 }}>{artist.name} — stall dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#666" }}>
          {user?.email && <span>{user.email}</span>}
          <form action={logout}>
            <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }}>
              Log out
            </button>
          </form>
        </div>
      </div>

      {session.role === "admin" && stallList.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {stallList.map((s) => (
            <a
              key={s.id}
              href={`/vendor?artist=${s.slug}`}
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
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Stall details</h2>
        <form action={updateStallDetails}>
          <input type="hidden" name="artistId" value={artist.id} />
          <label style={{ fontSize: 12, color: "#666" }}>Name</label>
          <input style={inputStyle} name="name" defaultValue={artist.name} required />
          <label style={{ fontSize: 12, color: "#666" }}>Tagline</label>
          <input style={inputStyle} name="tagline" defaultValue={artist.tagline ?? ""} />
          <label style={{ fontSize: 12, color: "#666" }}>Bio</label>
          <textarea
            style={{ ...inputStyle, minHeight: 100 }}
            name="bio"
            defaultValue={artist.bio ?? ""}
          />
          <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
            <input type="checkbox" name="isPopup" defaultChecked={artist.is_popup} /> Pop-up drop
            (temporary stall with a scheduled window)
          </label>
          <label style={{ fontSize: 12, color: "#666" }}>Pop-up starts at</label>
          <input
            style={inputStyle}
            type="datetime-local"
            name="popupStartsAt"
            defaultValue={toDatetimeLocal(artist.popup_starts_at)}
          />
          <label style={{ fontSize: 12, color: "#666" }}>Pop-up ends at</label>
          <input
            style={inputStyle}
            type="datetime-local"
            name="popupEndsAt"
            defaultValue={toDatetimeLocal(artist.popup_ends_at)}
          />
          <button type="submit" style={{ padding: "6px 14px" }}>
            Save details
          </button>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Photos</h2>
        <div style={{ display: "flex", gap: 24 }}>
          <PhotoUploader
            label="Logo"
            artistId={artist.id}
            field="logo_url"
            currentUrl={artist.logo_url}
          />
          <PhotoUploader
            label="Hero image"
            artistId={artist.id}
            field="hero_image_url"
            currentUrl={artist.hero_image_url}
          />
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add a product</h2>
        <form action={createProduct}>
          <input type="hidden" name="artistId" value={artist.id} />
          <label style={{ fontSize: 12, color: "#666" }}>Name</label>
          <input style={inputStyle} name="name" required />
          <label style={{ fontSize: 12, color: "#666" }}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: 70 }} name="description" />
          <label style={{ fontSize: 12, color: "#666" }}>Category</label>
          <select style={inputStyle} name="category" defaultValue={CATEGORY_ORDER[0]} required>
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: "#666" }}>Photo</label>
          <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="photo" accept="image/*" />

          <p style={{ fontSize: 13, marginBottom: 6 }}>Variants (label, price, stock) — fill in at least one</p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input style={{ flex: 2, padding: 6, fontSize: 13 }} name={`variantLabel-${i}`} placeholder="Label (e.g. A5)" />
              <input style={{ flex: 1, padding: 6, fontSize: 13 }} name={`variantPrice-${i}`} type="number" min={0} step="0.01" placeholder="Price" />
              <input style={{ flex: 1, padding: 6, fontSize: 13 }} name={`variantStock-${i}`} type="number" min={0} placeholder="Stock" />
            </div>
          ))}

          <button type="submit" style={{ padding: "6px 14px", marginTop: 8 }}>
            Add product
          </button>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Products &amp; stock</h2>
        {(products ?? []).length === 0 && <p>No products for this stall yet.</p>}
        {(products ?? []).map((product) => (
          <div key={product.id} style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
            <form action={updateProduct}>
              <input type="hidden" name="productId" value={product.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{product.name}</strong>
                <span style={{ fontSize: 12, color: "#666" }}>{product.sold_count} sold</span>
              </div>

              {product.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{ maxWidth: 120, maxHeight: 120, margin: "8px 0", border: "1px solid #ccc" }}
                />
              )}

              <label style={{ fontSize: 12, color: "#666" }}>Name</label>
              <input style={inputStyle} name="name" defaultValue={product.name} required />
              <label style={{ fontSize: 12, color: "#666" }}>Description</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} name="description" defaultValue={product.description ?? ""} />
              <label style={{ fontSize: 12, color: "#666" }}>Category</label>
              <select style={inputStyle} name="category" defaultValue={product.category} required>
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: "#666" }}>Replace photo</label>
              <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="photo" accept="image/*" />

              <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
                <input type="checkbox" name="isActive" defaultChecked={product.is_active} /> Active
                (visible on the stall)
              </label>

              {product.product_variants.map((variant) => (
                <div key={variant.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input type="hidden" name="variantId" value={variant.id} />
                  <input
                    style={{ flex: 2, padding: 4, fontSize: 13 }}
                    name={`variantLabel-${variant.id}`}
                    defaultValue={variant.label}
                  />
                  <label style={{ fontSize: 12, color: "#666" }}>Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    name={`variantPrice-${variant.id}`}
                    defaultValue={variant.price}
                    style={{ width: 80, padding: 4 }}
                  />
                  <label style={{ fontSize: 12, color: "#666" }}>Stock</label>
                  <input
                    type="number"
                    min={0}
                    name={`variantStock-${variant.id}`}
                    defaultValue={variant.stock}
                    style={{ width: 80, padding: 4 }}
                  />
                </div>
              ))}
              <button type="submit" style={{ padding: "6px 14px", marginTop: 8 }}>
                Save changes
              </button>
            </form>
            <div style={{ marginTop: 8 }}>
              <DeleteProductButton productId={product.id} productName={product.name} />
            </div>
          </div>
        ))}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Account</h2>
        <PasswordChangeForm />
      </section>
    </div>
  );
}

function PhotoUploader({
  label,
  artistId,
  field,
  currentUrl,
}: {
  label: string;
  artistId: string;
  field: "logo_url" | "hero_image_url";
  currentUrl: string | null;
}) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 13, marginBottom: 6 }}>{label}</p>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt={label}
          style={{ maxWidth: "100%", maxHeight: 120, marginBottom: 8, border: "1px solid #ccc" }}
        />
      ) : (
        <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>No {label.toLowerCase()} yet.</p>
      )}
      <form action={uploadStallPhoto}>
        <input type="hidden" name="artistId" value={artistId} />
        <input type="hidden" name="field" value={field} />
        <input type="file" name="file" accept="image/*" required style={{ marginBottom: 8, fontSize: 12 }} />
        <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }}>
          Upload
        </button>
      </form>
    </div>
  );
}
