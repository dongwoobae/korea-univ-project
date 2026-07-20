import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { landmarkId, photoUrl } = await request.json();

    if (!landmarkId || !photoUrl) {
      return NextResponse.json(
        { error: "landmarkId ?먮뒗 photoUrl ?꾨씫" },
        { status: 400 },
      );
    }

    const key = getR2KeyFromPublicUrl(photoUrl);
    console.log(`[delete-landmark-photo] landmarkId=${landmarkId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }

    const { error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: null })
      .eq("id", landmarkId);

    if (dbError) {
      console.error("[delete-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "?쒕쾭 ?ㅻ쪟" }, { status: 500 });
  }
}
