import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, videoUrl } = await request.json();

    if (!facilityId || !videoUrl) {
      return NextResponse.json(
        { error: "facilityId 또는 videoUrl 누락" },
        { status: 400 },
      );
    }

    const key = getR2KeyFromPublicUrl(videoUrl);

    console.log(`[delete-facility-video] facilityId=${facilityId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }

    const { error: dbError } = await supabaseAdmin
      .from("building_facilities")
      .update({ video_url: null })
      .eq("id", facilityId);

    if (dbError) {
      console.error("[delete-facility-video] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log("[delete-facility-video] success");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-facility-video] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
