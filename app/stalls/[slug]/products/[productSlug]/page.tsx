import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductDetail from "@/components/ProductDetail";
import { getProductDetail } from "@/lib/catalogue";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { slug: string; productSlug: string };
}): Promise<Metadata> {
  const product = await getProductDetail(params.slug, params.productSlug);
  if (!product) return {};
  return {
    title: `${product.name} — ${product.stallName} — Art Kade`,
    description: product.description ?? undefined,
    alternates: { canonical: `/stalls/${params.slug}/products/${params.productSlug}` },
  };
}

// Real, directly-loadable/shareable product page. Reached on a hard
// navigation (typed URL, refresh, external link) -- a soft nav from within
// /stalls/[slug] instead gets intercepted by @modal/(.)products, which
// renders the same ProductDetail content as a layered overlay on top of
// the stall list rather than this standalone page. See
// app/stalls/[slug]/layout.tsx and @modal for how the two stay in sync.
export default async function ProductPage({
  params,
}: {
  params: { slug: string; productSlug: string };
}) {
  const product = await getProductDetail(params.slug, params.productSlug);
  if (!product) return notFound();

  return (
    <>
      <Header />
      <div className="mx-auto max-w-5xl">
        <ProductDetail product={product} />
      </div>
      <Footer />
    </>
  );
}
