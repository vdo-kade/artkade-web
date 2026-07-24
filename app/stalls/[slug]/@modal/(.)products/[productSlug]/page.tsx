import ProductModal from "@/components/ProductModal";
import ProductDetail from "@/components/ProductDetail";
import { getProductDetail } from "@/lib/catalogue";

export const revalidate = 0;

// Intercepted counterpart of app/stalls/[slug]/products/[productSlug] --
// only reached via a soft (client-side) navigation from within
// /stalls/[slug], per the (.)products convention. A direct load/refresh of
// the same URL never matches this file at all (Next serves the real page
// route instead), so there's no risk of this rendering as a bare overlay
// with nothing underneath it.
//
// Deliberately doesn't call notFound() on a miss -- that would bubble to
// the nearest not-found boundary and blank out the whole stall page still
// mounted behind this slot, not just the modal. A small inline message
// inside the still-dismissable shell is the right failure mode here.
export default async function InterceptedProductPage({
  params,
}: {
  params: { slug: string; productSlug: string };
}) {
  const product = await getProductDetail(params.slug, params.productSlug);

  return (
    <ProductModal>
      {product ? (
        <ProductDetail product={product} />
      ) : (
        <p className="p-10 text-center text-warm-grey">Product not found.</p>
      )}
    </ProductModal>
  );
}
