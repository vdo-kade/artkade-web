import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIpFromRequest } from "@/lib/rate-limit";
import { detectImageType, MAX_UPLOAD_BYTES } from "@/lib/image-validation";
import { ORDER_NUMBER_PATTERN } from "@/lib/orders";

// Payment proofs live in their own private "payment-proofs" bucket, kept
// separate from the public "media" bucket (product/artist photos) so
// customer uploads never end up publicly reachable. There's no anon
// INSERT policy on storage.objects for it (customers placing orders
// shouldn't get broad write access to storage), so this route runs
// server-side with the service role key -- kept out of the browser
// bundle -- to accept the upload on their behalf, the same way order
// review/approval works.
//
// This route is deliberately reachable without a session -- customers
// upload their payment proof before an order (or account) exists, and the
// task never asked for full auth here. IP is the only signal available to
// rate-limit against as a result, same tradeoff as the checkout and gate
// limiters (see lib/rate-limit.ts).
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server is missing Supabase configuration." },
      { status: 500 }
    );
  }

  const ip = getClientIpFromRequest(req);
  if (!checkRateLimit(`upload-payment-proof:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const orderNumber = formData.get("orderNumber");

  if (!(file instanceof File) || typeof orderNumber !== "string" || !orderNumber) {
    return NextResponse.json(
      { error: "Missing file or orderNumber." },
      { status: 400 }
    );
  }
  // orderNumber becomes a storage path segment below -- constrain its
  // shape before it ever reaches Storage, not just at order-creation time
  // (placeOrder re-validates the same pattern, but this route can be hit
  // on its own, ahead of and independent from that call).
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 10MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) {
    return NextResponse.json(
      { error: "File must be a JPEG, PNG, GIF, or WEBP image." },
      { status: 400 }
    );
  }

  const path = `${orderNumber}-${Date.now()}.${detected.ext}`;

  // Never forward raw error text from here to the client -- internal
  // client-library errors (e.g. a malformed key breaking header
  // construction) can embed sensitive values like the service role key
  // in their message. Log full detail server-side only; the browser only
  // ever gets a fixed, safe string.
  try {
    const supabase = createClient(url, serviceKey);
    const { error } = await supabase.storage
      .from("payment-proofs")
      .upload(path, bytes, {
        // Whatever byte signature was actually detected, not whatever
        // content-type label the browser sent -- the client's claim is no
        // longer trusted past the sniff above.
        contentType: detected.mime,
      });

    if (error) {
      console.error("Payment proof upload failed:", error);
      return NextResponse.json(
        { error: "Upload failed. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ path });
  } catch (err) {
    console.error("Payment proof upload threw:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
