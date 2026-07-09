import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, videoUrl } = await request.json();

    if (!facilityId || !videoUrl) {
      return NextResponse.json({ error: "facilityId 또는 videoUrl 누락" }, { status: 400 });
    }

    // PUBLIC_URL 뒤의 경로를 R2 key로 사용
    const key = videoUrl.startsWith(PUBLIC_URL + "/")
      ? videoUrl.slice(PUBLIC_URL.length + 1)
      : null;

    console.log(`[delete-facility-video] facilityId=${facilityId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
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
