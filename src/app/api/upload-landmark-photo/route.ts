import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getPublicR2Url, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (!UUID_RE.test(landmarkId)) {
      return NextResponse.json(
        { error: "잘못된 명소 ID" },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("landmarks")
      .select("id, photo_url")
      .eq("id", landmarkId)
      .maybeSingle();

    if (fetchError) {
      console.error("[upload-landmark-photo] fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(
        { error: "명소를 찾을 수 없어요" },
        { status: 404 },
      );
    }

    const previousPhotoUrl = existing.photo_url;

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
    const { data: updated, error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: photoUrl })
      .eq("id", landmarkId)
      .select("id");

    if (dbError) {
      console.error("[upload-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (cleanupErr) {
        console.error(
          "[upload-landmark-photo] orphan cleanup failed:",
          cleanupErr,
        );
      }
      return NextResponse.json(
        { error: "명소를 찾을 수 없어요" },
        { status: 404 },
      );
    }

    if (previousPhotoUrl && previousPhotoUrl !== photoUrl) {
      const oldKey = getR2KeyFromPublicUrl(previousPhotoUrl);
      if (oldKey) {
        try {
          await r2.send(
            new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey }),
          );
        } catch (cleanupErr) {
          console.error(
            "[upload-landmark-photo] old photo cleanup failed:",
            cleanupErr,
          );
        }
      }
    }

    revalidatePath("/api/landmarks");

    return NextResponse.json({ photoUrl });
  } catch (err) {
    console.error("[upload-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
