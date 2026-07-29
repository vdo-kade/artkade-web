import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import AdminNav from "@/components/AdminNav";
import { ActionForm } from "@/components/ActionForm";
import { createPost, updatePost } from "./actions";
import DeletePostButton from "./DeletePostButton";

export const revalidate = 0;

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string | null;
  hero_image_url: string | null;
  artist_id: string | null;
  published: boolean;
  published_at: string | null;
};

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

function GodMagazineError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load the magazine. Check the server logs for details.</p>
    </div>
  );
}

export default async function AdminMagazinePage() {
  const session = await getSessionRole();
  if (!session || (session.role !== "admin" && session.role !== "restricted_admin")) {
    redirect("/admin/login");
  }
  // Magazine is editorial content, not order fulfilment -- restricted_admin
  // (view everything + fulfil orders, see lib/session-role.ts) can read
  // this page but createPost/updatePost/deletePost in ./actions.ts still
  // reject it, same as every other admin-only write.
  const canManage = session.role === "admin";

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <GodMagazineError />;
  }

  const [postsResult, artistsResult] = await Promise.all([
    supabase
      .from("magazine_posts")
      .select("id, slug, title, excerpt, body, category, hero_image_url, artist_id, published, published_at")
      .order("created_at", { ascending: false })
      .returns<PostRow[]>(),
    supabase.from("artists").select("id, name").order("sort_order"),
  ]);

  if (postsResult.error) {
    console.error("Failed to load magazine posts:", postsResult.error);
    return <GodMagazineError />;
  }

  const posts = postsResult.data ?? [];
  const artists = artistsResult.data ?? [];

  return (
    <>
      <AdminNav role={session.role} />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin">&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Magazine</h1>

      {canManage && (
        <section style={card}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>New post</h2>
          <ActionForm action={createPost} resetOnSuccess>
            <label style={{ fontSize: 12, color: "#666" }}>Title</label>
            <input style={inputStyle} name="title" required />
            <label style={{ fontSize: 12, color: "#666" }}>
              Slug (optional -- leave blank to generate from the title)
            </label>
            <input style={inputStyle} name="slug" placeholder="e.g. nuwan-shilpa-psychedelic-visionary-art" />
            <label style={{ fontSize: 12, color: "#666" }}>Excerpt</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} name="excerpt" />
            <label style={{ fontSize: 12, color: "#666" }}>
              Body (plain paragraphs, blank line between each -- "## " starts a heading,
              [text](url) renders as a real link)
            </label>
            <textarea style={{ ...inputStyle, minHeight: 140 }} name="body" />
            <label style={{ fontSize: 12, color: "#666" }}>Category</label>
            <input style={inputStyle} name="category" placeholder="e.g. Interview" />
            <label style={{ fontSize: 12, color: "#666" }}>Related stall (optional)</label>
            <select style={inputStyle} name="artistId" defaultValue="">
              <option value="">None</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 12, color: "#666" }}>Hero image</label>
            <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="hero" accept="image/*" />
            <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
              <input type="checkbox" name="published" /> Published
            </label>
            <button type="submit" style={{ padding: "6px 14px" }}>
              Create post
            </button>
          </ActionForm>
        </section>
      )}

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>All posts</h2>
      {posts.length === 0 && <p>No posts yet.</p>}
      {posts.map((post) =>
        canManage ? (
          <div key={post.id} style={card}>
            <ActionForm action={updatePost} successMessage="Saved.">
              <input type="hidden" name="id" value={post.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>{post.title}</strong>
                <span style={{ fontSize: 12, color: post.published ? "green" : "#999" }}>
                  {post.published ? "Published" : "Draft"}
                </span>
              </div>

              {post.hero_image_url && (
                <Image
                  src={post.hero_image_url}
                  alt={post.title}
                  width={640}
                  height={400}
                  sizes="160px"
                  style={{ width: "auto", height: "auto", maxWidth: 160, maxHeight: 100, margin: "8px 0", border: "1px solid #ccc" }}
                />
              )}

              <label style={{ fontSize: 12, color: "#666" }}>Title</label>
              <input style={inputStyle} name="title" defaultValue={post.title} required />
              <label style={{ fontSize: 12, color: "#666" }}>Excerpt</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} name="excerpt" defaultValue={post.excerpt ?? ""} />
              <label style={{ fontSize: 12, color: "#666" }}>Body</label>
              <textarea style={{ ...inputStyle, minHeight: 140 }} name="body" defaultValue={post.body ?? ""} />
              <label style={{ fontSize: 12, color: "#666" }}>Category</label>
              <input style={inputStyle} name="category" defaultValue={post.category ?? ""} />
              <label style={{ fontSize: 12, color: "#666" }}>Related stall (optional)</label>
              <select style={inputStyle} name="artistId" defaultValue={post.artist_id ?? ""}>
                <option value="">None</option>
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: "#666" }}>Replace hero image</label>
              <input style={{ marginBottom: 12, fontSize: 12 }} type="file" name="hero" accept="image/*" />
              <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
                <input type="checkbox" name="published" defaultChecked={post.published} /> Published
              </label>
              <button type="submit" style={{ padding: "6px 14px" }}>
                Save changes
              </button>
            </ActionForm>
            <div style={{ marginTop: 8 }}>
              <DeletePostButton id={post.id} title={post.title} />
            </div>
          </div>
        ) : (
          <div key={post.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>{post.title}</strong>
              <span style={{ fontSize: 12, color: post.published ? "green" : "#999" }}>
                {post.published ? "Published" : "Draft"}
              </span>
            </div>
            {post.excerpt && <p style={{ fontSize: 13, color: "#666" }}>{post.excerpt}</p>}
          </div>
        )
      )}
      </div>
    </>
  );
}
