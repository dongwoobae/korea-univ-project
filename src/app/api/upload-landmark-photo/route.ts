import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getPublicR2Url } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const landmarkId = formData.get("landmarkId");

    if (!(file instanceof File) || typeof landmarkId !== "string") {
      return NextResponse.json(
        { error: "파일 또는 명소 ID 누락" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "jpg, png, webp, gif 형식만 업로드 가능해요" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "사진 크기는 5MB 이하여야 해요" },
        { status: 400 },
      );
    }

    const key = `landmark-photos/${landmarkId}/${Date.now()}.${extensionFor(
      file.type,
    )}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    const photoUrl = getPublicR2Url(key);
    const { error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: photoUrl })
      .eq("id", landmarkId);

    if (dbError) {
      console.error("[upload-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ photoUrl });
  } catch (err) {
    console.error("[upload-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
