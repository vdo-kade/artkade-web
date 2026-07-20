import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase-admin";
import { getCachedUser } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { logout } from "@/app/admin/actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/catalogue";
import { FREEBIE_CATEGORY_LABELS, FREEBIE_CATEGORY_ORDER, FREEBIE_SELECT, type FreebieRow } from "@/lib/freebies";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import {
  SHIPPING_METHOD_LABELS,
  registeredPostShipDate,
  formatShipDate,
  type ShippingMethod,
} from "@/lib/shipping";
import { updateStallDetails, uploadStallPhoto, createProduct, updateProduct, createFreebie } from "./actions";
import DeleteProductButton from "./DeleteProductButton";
import DeleteFreebieButton from "./DeleteFreebieButton";
import PasswordChangeForm from "./PasswordChangeForm";
import NewProductToast from "./NewProductToast";
import DashboardTabs from "./DashboardTabs";
import AdminNav from "@/components/AdminNav";
import { ActionForm } from "@/components/ActionForm";
import StatusHistory, { type StatusHistoryEntry } from "@/components/StatusHistory";
import OrderFulfillmentActions from "@/components/OrderFulfillmentActions";
import { approveOrder, rejectOrder } from "@/app/admin/orders/actions";

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

type CollaboratorProductRow = {
  id: string;
  artist_id: string;
  name: string;
  category: string;
  product_variants: { label: string; stock: number }[];
};
type CollaboratorOrderRow = { id: string; order_items: { product_id: string }[] };
type CollaboratorStall = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  products: CollaboratorProductRow[];
  pendingOrders: number;
};

type OfflineSaleRow = {
  id: string;
  quantity: number;
  unit_price: number;
  sold_at: string;
  products: { name: string } | null;
  product_variants: { label: string } | null;
};

type TrackerOrderItemRow = {
  order_id: string;
  quantity: number;
  products: { name: string } | null;
  orders: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    shipping_address: string;
    status: string;
    total_amount: number;
    created_at: string;
    shipping_method: ShippingMethod | null;
  };
};

type AllOrderItemsRow = { order_id: string; products: { artist_id: string } | null };
type OrderHistoryRow = { order_id: string; status: string; note: string | null; created_at: string };

type TrackerOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  itemNames: string[];
  // Whether every item in the order (not just this stall's own items)
  // belongs to this vendor -- gates whether approve/reject/fulfillment
  // buttons render at all. Re-checked independently server-side by the
  // actions themselves (see app/admin/orders/actions.ts's
  // vendorOwnsWholeOrder) -- this is purely a display-side mirror of that
  // same rule so a vendor doesn't see buttons that would just reject them.
  isSingleStall: boolean;
  history: StatusHistoryEntry[];
  shippingMethod: ShippingMethod | null;
};

const PROCESSED_STATUSES = new Set(["approved", "shipped", "delivered"]);

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
  resize: "vertical",
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
  searchParams: { artist?: string; created?: string };
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

  // Same cached call getSessionRole() above already made -- see
  // getCachedUser() in lib/supabase-server.ts for why a second independent
  // call here used to be able to break the session outright.
  const {
    data: { user },
  } = await getCachedUser();

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

  const [artistResult, productsResult, freebiesResult] = await Promise.all([
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
    supabase
      .from("freebies")
      .select(FREEBIE_SELECT)
      .eq("artist_id", selectedArtistId)
      .order("created_at", { ascending: false })
      .returns<FreebieRow[]>(),
  ]);

  if (artistResult.error) {
    console.error("Failed to load artist:", artistResult.error);
    return <VendorDashboardError />;
  }
  if (productsResult.error) {
    console.error("Failed to load products:", productsResult.error);
    return <VendorDashboardError />;
  }
  if (freebiesResult.error) {
    console.error("Failed to load freebies:", freebiesResult.error);
    return <VendorDashboardError />;
  }

  // Tracker tab data: this stall's offline (Vendor Mode) sales log/analytics,
  // and every online order that contains at least one of this stall's
  // products (an order can span multiple stalls -- total_amount below is
  // the whole order's total, not just this stall's share of it).
  const [offlineSalesResult, orderItemsResult] = await Promise.all([
    supabase
      .from("offline_sales")
      .select("id, quantity, unit_price, sold_at, products(name), product_variants(label)")
      .eq("artist_id", selectedArtistId)
      .order("sold_at", { ascending: false })
      .limit(500)
      .returns<OfflineSaleRow[]>(),
    supabase
      .from("order_items")
      .select(
        "order_id, quantity, products!inner(name, artist_id), orders!inner(id, order_number, customer_name, customer_phone, shipping_address, status, total_amount, created_at, shipping_method)"
      )
      .eq("products.artist_id", selectedArtistId)
      .returns<TrackerOrderItemRow[]>(),
  ]);

  const offlineSales = offlineSalesResult.data ?? [];
  const offlineSalesByDate = new Map<string, { count: number; total: number }>();
  for (const sale of offlineSales) {
    const date = sale.sold_at.slice(0, 10);
    const bucket = offlineSalesByDate.get(date) ?? { count: 0, total: 0 };
    bucket.count += sale.quantity;
    bucket.total += sale.quantity * sale.unit_price;
    offlineSalesByDate.set(date, bucket);
  }
  const salesByDate = Array.from(offlineSalesByDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 30);

  const trackerOrderIds = Array.from(new Set((orderItemsResult.data ?? []).map((r) => r.orders.id)));

  // Two follow-up queries, only possible once the order IDs above are
  // known: the *full* item composition of each order (not just this
  // stall's own items, which the query above deliberately filtered to) --
  // needed to tell whether a vendor is actually allowed to act on it (see
  // app/admin/orders/actions.ts's vendorOwnsWholeOrder, mirrored here for
  // display) -- and each order's status history for the timeline.
  const [allItemsResult, historyResult] = trackerOrderIds.length
    ? await Promise.all([
        supabase
          .from("order_items")
          .select("order_id, products(artist_id)")
          .in("order_id", trackerOrderIds)
          .returns<AllOrderItemsRow[]>(),
        supabase
          .from("order_status_history")
          .select("order_id, status, note, created_at")
          .in("order_id", trackerOrderIds)
          .returns<OrderHistoryRow[]>(),
      ])
    : [{ data: [] as AllOrderItemsRow[] }, { data: [] as OrderHistoryRow[] }];

  const artistIdsByOrder = new Map<string, Set<string>>();
  for (const row of allItemsResult.data ?? []) {
    if (!row.products?.artist_id) continue;
    if (!artistIdsByOrder.has(row.order_id)) artistIdsByOrder.set(row.order_id, new Set());
    artistIdsByOrder.get(row.order_id)!.add(row.products.artist_id);
  }
  const historyByOrder = new Map<string, StatusHistoryEntry[]>();
  for (const row of historyResult.data ?? []) {
    if (!historyByOrder.has(row.order_id)) historyByOrder.set(row.order_id, []);
    historyByOrder.get(row.order_id)!.push({ status: row.status, note: row.note, created_at: row.created_at });
  }

  const trackerOrdersById = new Map<string, TrackerOrder>();
  for (const row of orderItemsResult.data ?? []) {
    const o = row.orders;
    const existing = trackerOrdersById.get(o.id);
    if (existing) {
      if (row.products?.name) existing.itemNames.push(row.products.name);
    } else {
      const artistIds = artistIdsByOrder.get(o.id) ?? new Set([selectedArtistId]);
      trackerOrdersById.set(o.id, {
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        shippingAddress: o.shipping_address,
        status: o.status,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
        itemNames: row.products?.name ? [row.products.name] : [],
        isSingleStall: artistIds.size === 1 && artistIds.has(selectedArtistId),
        history: historyByOrder.get(o.id) ?? [],
        shippingMethod: o.shipping_method,
      });
    }
  }
  const trackerOrders = Array.from(trackerOrdersById.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
  const pendingTrackerOrders = trackerOrders.filter((o) => o.status === "awaiting_review");
  const processedTrackerOrders = trackerOrders.filter((o) => PROCESSED_STATUSES.has(o.status));
  const otherTrackerOrders = trackerOrders.filter(
    (o) => o.status !== "awaiting_review" && !PROCESSED_STATUSES.has(o.status)
  );

  // Day-keeper: pending/approved orders (the ones still waiting to be
  // packed) grouped by shipping method so it's obvious at a glance what
  // needs to ship by when -- Registered Post batches on a fixed weekly
  // cycle (see lib/shipping.ts's registeredPostShipDate), courier doesn't
  // have one, so it's just "arrange individually" rather than a made-up
  // date.
  const shipReadyOrders = trackerOrders.filter((o) => o.status === "awaiting_review" || o.status === "approved");
  const registeredPostOrders = shipReadyOrders.filter((o) => o.shippingMethod === "registered_post");
  const courierOrders = shipReadyOrders.filter((o) => o.shippingMethod !== "registered_post");
  const nextShipDate = formatShipDate(registeredPostShipDate());

  // Read-only visibility into a collab stall (e.g. Shilpa Kade has no login
  // of its own -- Nuwan sees it here instead of getting a second account).
  // Admin doesn't need this: they already see every stall via the stall
  // switcher above and the God dashboard.
  let collaboratorStalls: CollaboratorStall[] = [];
  if (session.role === "vendor") {
    const { data: collabRows } = await supabase
      .from("stall_collaborators")
      .select("target_artist_id")
      .eq("viewer_artist_id", session.artistId);
    const targetIds = (collabRows ?? []).map((r) => r.target_artist_id);

    if (targetIds.length > 0) {
      const [targetArtistsResult, targetProductsResult, pendingOrdersResult] = await Promise.all([
        supabase.from("artists").select("id, slug, name, tagline").in("id", targetIds),
        supabase
          .from("products")
          .select("id, artist_id, name, category, product_variants(label, stock)")
          .in("artist_id", targetIds)
          .returns<CollaboratorProductRow[]>(),
        supabase.from("orders").select("id, order_items(product_id)").eq("status", "awaiting_review").returns<CollaboratorOrderRow[]>(),
      ]);

      const targetProducts = targetProductsResult.data ?? [];
      const productArtistMap = new Map(targetProducts.map((p) => [p.id, p.artist_id]));
      const pendingByArtist = new Map<string, Set<string>>();
      for (const order of pendingOrdersResult.data ?? []) {
        const artistIdsInOrder = new Set(
          order.order_items.map((oi) => productArtistMap.get(oi.product_id)).filter((id): id is string => !!id)
        );
        for (const aid of artistIdsInOrder) {
          if (!pendingByArtist.has(aid)) pendingByArtist.set(aid, new Set());
          pendingByArtist.get(aid)!.add(order.id);
        }
      }

      collaboratorStalls = (targetArtistsResult.data ?? []).map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        tagline: a.tagline,
        products: targetProducts.filter((p) => p.artist_id === a.id),
        pendingOrders: pendingByArtist.get(a.id)?.size ?? 0,
      }));
    }
  }

  const artist = artistResult.data;
  const products = productsResult.data;
  const freebies = freebiesResult.data ?? [];

  if (!artist) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Stall not found.</div>;
  }

  return (
    <>
      <AdminNav role={session.role} />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto" }}>
      {searchParams.created && <NewProductToast createdId={searchParams.created} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24 }}>{artist.name} — stall dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#666" }}>
          {user?.email && <span>{user.email}</span>}
          <Link href={`/vendor/mode?artist=${artist.slug}`}>Vendor Mode &rarr;</Link>
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

      <DashboardTabs
        personal={
          <>
      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Stall details</h2>
        <ActionForm action={updateStallDetails} successMessage="Stall details saved.">
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
        </ActionForm>
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
          </>
        }
        stock={
          <>
      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add a product</h2>
        <ActionForm action={createProduct}>
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

          <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
            <input type="checkbox" name="isOneOff" /> One of one, only 1 unit exists ever
          </label>
          <p style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>
            Stock will be capped at 1 no matter what you enter below, and it won't restock once sold.
          </p>

          <p style={{ fontSize: 13, marginBottom: 6 }}>Fill in at least one variant (label, price, stock)</p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <input style={{ flex: "2 1 160px", minWidth: 0, padding: 6, fontSize: 13, boxSizing: "border-box" }} name={`variantLabel-${i}`} placeholder="Label (e.g. A5)" />
              <input style={{ flex: "1 1 90px", minWidth: 0, padding: 6, fontSize: 13, boxSizing: "border-box" }} name={`variantPrice-${i}`} type="number" min={0} step="0.01" placeholder="Price" />
              <input style={{ flex: "1 1 90px", minWidth: 0, padding: 6, fontSize: 13, boxSizing: "border-box" }} name={`variantStock-${i}`} type="number" min={0} placeholder="Stock" />
            </div>
          ))}

          <button type="submit" style={{ padding: "6px 14px", marginTop: 8 }}>
            Add product
          </button>
        </ActionForm>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Products &amp; stock</h2>
        {(products ?? []).length === 0 && <p>No products for this stall yet.</p>}
        {(products ?? []).map((product) => (
          <div
            key={product.id}
            id={`product-${product.id}`}
            style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}
          >
            <ActionForm action={updateProduct} successMessage="Product updated.">
              <input type="hidden" name="productId" value={product.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{product.name}</strong>
                <span style={{ fontSize: 12, color: "#666" }}>{product.sold_count} sold</span>
              </div>

              {product.image_url && (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  width={480}
                  height={480}
                  sizes="120px"
                  style={{ width: "auto", height: "auto", maxWidth: 120, maxHeight: 120, margin: "8px 0", border: "1px solid #ccc" }}
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
              <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
                <input type="checkbox" name="isOneOff" defaultChecked={product.is_one_off} /> One of one, only 1
                unit exists ever
              </label>
              {product.is_one_off && (
                <p style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>
                  Stock is capped at 1 below and won't restock once sold.
                </p>
              )}

              {product.product_variants.map((variant) => (
                <div key={variant.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input type="hidden" name="variantId" value={variant.id} />
                  <input
                    style={{ flex: "2 1 140px", minWidth: 0, padding: 4, fontSize: 13, boxSizing: "border-box" }}
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
                    style={{ width: 80, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
                  />
                  <label style={{ fontSize: 12, color: "#666" }}>Stock</label>
                  <input
                    type="number"
                    min={0}
                    max={product.is_one_off ? 1 : undefined}
                    name={`variantStock-${variant.id}`}
                    defaultValue={product.is_one_off ? Math.min(variant.stock, 1) : variant.stock}
                    style={{ width: 80, flexShrink: 0, padding: 4, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <button type="submit" style={{ padding: "6px 14px", marginTop: 8 }}>
                Save changes
              </button>
            </ActionForm>
            <div style={{ marginTop: 8 }}>
              <DeleteProductButton productId={product.id} productName={product.name} />
            </div>
          </div>
        ))}
      </section>

      {collaboratorStalls.map((stall) => (
        <section style={card} key={stall.id}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>
            {stall.name} <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>(view only)</span>
          </h2>
          {stall.tagline && <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{stall.tagline}</p>}
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            {stall.pendingOrders} pending order{stall.pendingOrders === 1 ? "" : "s"}
          </p>
          {stall.products.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>No products yet.</p>}
          {stall.products.map((product) => (
            <div key={product.id} style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{product.name}</span>
                <span style={{ fontSize: 12, color: "#666" }}>{product.category}</span>
              </div>
              {product.product_variants.map((v, i) => (
                <p key={i} style={{ fontSize: 12, color: "#666", margin: "2px 0" }}>
                  {v.label}: {v.stock} in stock
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
          </>
        }
        freebies={
          <>
            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add a freebie</h2>
              <ActionForm action={createFreebie} successMessage="Freebie added." resetOnSuccess>
                <input type="hidden" name="artistId" value={artist.id} />
                <label style={{ fontSize: 12, color: "#666" }}>Title</label>
                <input style={inputStyle} name="title" required />
                <label style={{ fontSize: 12, color: "#666" }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 70 }} name="description" />
                <label style={{ fontSize: 12, color: "#666" }}>Category</label>
                <select style={inputStyle} name="category" defaultValue={FREEBIE_CATEGORY_ORDER[0]} required>
                  {FREEBIE_CATEGORY_ORDER.map((cat) => (
                    <option key={cat} value={cat}>
                      {FREEBIE_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: 12, color: "#666" }}>File</label>
                <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="file" required />
                <label style={{ fontSize: 12, color: "#666" }}>Thumbnail (optional)</label>
                <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="thumbnail" accept="image/*" />
                <button type="submit" style={{ padding: "6px 14px", marginTop: 8 }}>
                  Add freebie
                </button>
              </ActionForm>
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>Existing freebies</h2>
              {freebies.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>No freebies for this stall yet.</p>}
              {freebies.map((f) => (
                <div key={f.id} id={`freebie-${f.id}`} style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>{f.title}</strong>
                    <span style={{ fontSize: 12, color: "#666" }}>{FREEBIE_CATEGORY_LABELS[f.category] ?? f.category}</span>
                  </div>
                  {f.description && <p style={{ fontSize: 13, color: "#666", margin: "4px 0" }}>{f.description}</p>}
                  {f.thumbnail_url && (
                    <Image
                      src={f.thumbnail_url}
                      alt={f.title}
                      width={400}
                      height={400}
                      sizes="100px"
                      style={{ width: "auto", height: "auto", maxWidth: 100, maxHeight: 100, margin: "8px 0", border: "1px solid #ccc" }}
                    />
                  )}
                  <p style={{ fontSize: 12, margin: "4px 0" }}>
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                      View file &rarr;
                    </a>
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <DeleteFreebieButton freebieId={f.id} freebieTitle={f.title} />
                  </div>
                </div>
              ))}
            </section>
          </>
        }
        tracker={
          <>
            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>Sales by date</h2>
              {salesByDate.length === 0 ? (
                <p style={{ fontSize: 13, color: "#999" }}>No Vendor Mode sales logged yet.</p>
              ) : (
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#666", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: "4px 0", fontWeight: "normal" }}>Date</th>
                      <th style={{ padding: "4px 0", fontWeight: "normal" }}>Items sold</th>
                      <th style={{ padding: "4px 0", fontWeight: "normal" }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesByDate.map(([date, bucket]) => (
                      <tr key={date} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "4px 0" }}>{date}</td>
                        <td style={{ padding: "4px 0" }}>{bucket.count}</td>
                        <td style={{ padding: "4px 0" }}>Rs. {bucket.total.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>Offline sales log</h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                Every in-person sale logged from Vendor Mode, most recent first.
              </p>
              {offlineSales.length === 0 ? (
                <p style={{ fontSize: 13, color: "#999" }}>Nothing logged yet.</p>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {offlineSales.map((s) => (
                    <p key={s.id} style={{ fontSize: 13, margin: "4px 0" }}>
                      {s.products?.name ?? "(deleted product)"} — {s.product_variants?.label ?? "-"} &times; {s.quantity} — Rs.{" "}
                      {(s.unit_price * s.quantity).toLocaleString("en-US")}
                      <span style={{ color: "#999" }}>
                        {" "}
                        · {new Date(s.sold_at).toLocaleDateString()} {new Date(s.sold_at).toLocaleTimeString()}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 4 }}>Ship by</h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                Pending and approved orders, grouped by how they'll ship.
              </p>
              {shipReadyOrders.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>Nothing waiting to ship.</p>}
              {registeredPostOrders.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    📮 {SHIPPING_METHOD_LABELS.registered_post} — ship by {nextShipDate}{" "}
                    <span style={{ fontWeight: "normal", color: "#666" }}>({registeredPostOrders.length})</span>
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
                    {registeredPostOrders.map((o) => (
                      <li key={o.id} style={{ padding: "2px 0" }}>
                        {o.orderNumber} — {o.customerName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {courierOrders.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    🚚 {SHIPPING_METHOD_LABELS.courier} — arrange individually{" "}
                    <span style={{ fontWeight: "normal", color: "#666" }}>({courierOrders.length})</span>
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
                    {courierOrders.map((o) => (
                      <li key={o.id} style={{ padding: "2px 0" }}>
                        {o.orderNumber} — {o.customerName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 4 }}>
                Orders — pending <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>({pendingTrackerOrders.length})</span>
              </h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                Online orders containing this stall's products, awaiting review.
              </p>
              {pendingTrackerOrders.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>None right now.</p>}
              {pendingTrackerOrders.map((o) => (
                <TrackerOrderRow key={o.id} order={o} />
              ))}
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 18, marginBottom: 4 }}>
                Orders — processed <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>({processedTrackerOrders.length})</span>
              </h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Approved, shipped, or delivered.</p>
              {processedTrackerOrders.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>None yet.</p>}
              {processedTrackerOrders.map((o) => (
                <TrackerOrderRow key={o.id} order={o} />
              ))}
              {otherTrackerOrders.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, color: "#666", margin: "16px 0 8px" }}>Rejected / cancelled / out of stock</h3>
                  {otherTrackerOrders.map((o) => (
                    <TrackerOrderRow key={o.id} order={o} />
                  ))}
                </>
              )}
            </section>
          </>
        }
        account={
          <section style={card}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Account</h2>
            <PasswordChangeForm />
          </section>
        }
      />
      </div>
    </>
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
        <Image
          src={currentUrl}
          alt={label}
          width={480}
          height={480}
          sizes="300px"
          style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: 120, marginBottom: 8, border: "1px solid #ccc" }}
        />
      ) : (
        <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>No {label.toLowerCase()} yet.</p>
      )}
      <ActionForm action={uploadStallPhoto} successMessage="Photo uploaded.">
        <input type="hidden" name="artistId" value={artistId} />
        <input type="hidden" name="field" value={field} />
        <input type="file" name="file" accept="image/*" required style={{ marginBottom: 8, fontSize: 12 }} />
        <button type="submit" style={{ padding: "4px 10px", fontSize: 13 }}>
          Upload
        </button>
      </ActionForm>
    </div>
  );
}

// Approve/reject/mark-shipped/etc are the exact same actions the God
// dashboard uses (app/admin/orders/actions.ts) -- they independently
// re-check that this vendor actually owns every item in the order before
// doing anything, so isSingleStall here only controls whether the buttons
// render, not whether the action is actually allowed to succeed.
function TrackerOrderRow({ order }: { order: TrackerOrder }) {
  const canAct = order.isSingleStall;
  return (
    <div style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{order.orderNumber}</strong>
        <span style={{ fontSize: 12, color: "#666" }}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <p style={{ fontSize: 13, margin: "2px 0" }}>{order.customerName}</p>
      <p style={{ fontSize: 12, color: "#666", margin: "2px 0" }}>{order.itemNames.join(", ")}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "#999" }}>
          {new Date(order.createdAt).toLocaleDateString()} · order total Rs. {order.totalAmount.toLocaleString("en-US")}
        </span>
        <a
          href={`/vendor/label/${order.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12 }}
        >
          Shipping label &rarr;
        </a>
      </div>

      {!canAct && (
        <p style={{ fontSize: 12, color: "#a06a00", marginTop: 6 }}>
          This order also includes another stall&apos;s items -- Art Kade staff manage it.
        </p>
      )}

      {canAct && order.status === "awaiting_review" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <ActionForm action={approveOrder} successMessage="Approved.">
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" style={{ background: "green", color: "white", padding: "6px 12px", border: "none" }}>
              Approve
            </button>
          </ActionForm>
          <ActionForm action={rejectOrder} successMessage="Rejected.">
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" style={{ background: "#b00", color: "white", padding: "6px 12px", border: "none" }}>
              Reject
            </button>
          </ActionForm>
        </div>
      )}
      {canAct && <OrderFulfillmentActions orderId={order.id} status={order.status} />}

      <StatusHistory history={order.history} />
    </div>
  );
}
