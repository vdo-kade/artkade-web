import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The "media" bucket is private and has no anon INSERT policy on
// storage.objects (customers placing orders shouldn't get broad write
// access to storage). This route runs server-side with the service role
// key -- kept out of the browser bundle -- to accept the upload on their
// behalf, the same way order review/approval will eventually work.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server is missing Supabase configuration." },
      { status: 500 }
    );
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

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `payment-proofs/${orderNumber}-${Date.now()}.${ext}`;

  // Never forward raw error text from here to the client -- internal
  // client-library errors (e.g. a malformed key breaking header
  // construction) can embed sensitive values like the service role key
  // in their message. Log full detail server-side only; the browser only
  // ever gets a fixed, safe string.
  try {
    const supabase = createClient(url, serviceKey);
    const { error } = await supabase.storage
      .from("media")
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
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
