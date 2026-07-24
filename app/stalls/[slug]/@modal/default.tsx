// Required so the @modal slot has something to render whenever the current
// route wasn't matched by the (.)products interceptor -- a direct load of
// /stalls/[slug], or a direct/refreshed load of
// /stalls/[slug]/products/[productSlug] (which renders via the real page
// route instead, not this slot). Without this, Next 404s the whole layout
// on any URL that doesn't also happen to match something under @modal.
export default function Default() {
  return null;
}
