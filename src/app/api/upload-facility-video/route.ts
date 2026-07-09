import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE = 200 * 1024 * 1024; // 200MB

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const facilityId = formData.get("facilityId");

    if (!file || !facilityId) {
      return NextResponse.json(
        { error: "파일 또는 시설 ID 누락" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "mp4, webm, mov 형식만 업로드 가능해요" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 200MB 이하여야 해요" },
        { status: 400 },
      );
    }

    const ext =
      file.type === "video/webm"
        ? "webm"
        : file.type === "video/quicktime"
          ? "mov"
          : "mp4";
    const key = `facility-videos/${facilityId}/${Date.now()}.${ext}`;

    console.log(
      `[upload-facility-video] facilityId=${facilityId} size=${buffer.length} key=${key}`,
    );

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    const videoUrl = `${PUBLIC_URL}/${key}`;

    const { error: dbError } = await supabaseAdmin
      .from("building_facilities")
      .update({ video_url: videoUrl })
      .eq("id", facilityId);

    if (dbError) {
      console.error("[upload-facility-video] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log("[upload-facility-video] success:", videoUrl);
    return NextResponse.json({ videoUrl });
  } catch (err) {
    console.error("[upload-facility-video] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
