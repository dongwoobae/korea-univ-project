import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getPublicR2Url, getR2KeyFromPublicUrl } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

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
  const failures = routeFailures({
    route: "/api/upload-landmark-photo",
    action: "landmark_photo.upload",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const landmarkId = formData.get("landmarkId");

    if (!(file instanceof File) || typeof landmarkId !== "string") {
      return failures.respond(400, "파일 또는 명소 ID 누락", "invalid_input");
    }

    failures.setTarget({ table: "landmarks", id: landmarkId });
    if (!UUID_RE.test(landmarkId)) {
      return failures.respond(400, "잘못된 명소 ID", "invalid_input");
    }

    const { data: existing, error: fetchError } = await db
      .from("landmarks")
      .select("id, photo_url")
      .eq("id", landmarkId)
      .maybeSingle();

    if (fetchError) {
      console.error("[upload-landmark-photo] fetch error:", fetchError);
      return failures.respond(500, fetchError.message, "server_error", {
        error: fetchError,
      });
    }

    if (!existing) {
      return failures.respond(404, "명소를 찾을 수 없어요", "not_found");
    }

    const previousPhotoUrl = existing.photo_url;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failures.respond(
        400,
        "jpg, png, webp, gif 형식만 업로드 가능해요",
        "unsupported_type",
        { fileType: file.type },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
      return failures.respond(
        400,
        "사진 크기는 5MB 이하여야 해요",
        "payload_too_large",
        { fileSize: buffer.length, limit: MAX_SIZE },
      );
    }

    const key = `landmark-photos/${landmarkId}/${Date.now()}.${extensionFor(
      file.type,
    )}`;

    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        }),
      );
    } catch (storageError) {
      console.error("[upload-landmark-photo] unexpected error:", storageError);
      return failures.respond(500, "서버 오류", "storage_error", {
        error: storageError,
      });
    }

    const photoUrl = getPublicR2Url(key);
    const { data: updated, error: dbError } = await db
      .from("landmarks")
      .update({ photo_url: photoUrl })
      .eq("id", landmarkId)
      .select("id");

    if (dbError) {
      console.error("[upload-landmark-photo] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    if (!updated || updated.length === 0) {
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (cleanupErr) {
        console.error(
          "[upload-landmark-photo] orphan cleanup failed:",
          cleanupErr,
        );
        failures.record("storage_error", { followUp: true, error: cleanupErr });
      }
      return failures.respond(404, "명소를 찾을 수 없어요", "not_found");
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
          failures.record("storage_error", {
            followUp: true,
            error: cleanupErr,
          });
        }
      }
    }

    revalidatePath("/api/landmarks");

    return NextResponse.json({ photoUrl });
  } catch (err) {
    console.error("[upload-landmark-photo] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
