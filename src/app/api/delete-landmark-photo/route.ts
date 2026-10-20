import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/delete-landmark-photo",
    action: "landmark_photo.delete",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const { landmarkId, photoUrl } = await request.json();

    if (!landmarkId || !photoUrl) {
      return failures.respond(
        400,
        "landmarkId 또는 photoUrl 누락",
        "invalid_input",
      );
    }
    failures.setTarget({ table: "landmarks", id: String(landmarkId) });

    if (typeof landmarkId !== "string" || !UUID_RE.test(landmarkId)) {
      return failures.respond(400, "잘못된 명소 ID", "invalid_input");
    }

    if (typeof photoUrl !== "string") {
      return failures.respond(400, "잘못된 사진 URL", "invalid_input");
    }
    const key = getR2KeyFromPublicUrl(photoUrl);
    if (!key) {
      return failures.respond(400, "잘못된 사진 URL", "invalid_input");
    }
    const { data: updated, error: dbError } = await db
      .from("landmarks")
      .update({ photo_url: null })
      .eq("id", landmarkId)
      .eq("photo_url", photoUrl)
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("[delete-landmark-photo] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    if (!updated) {
      return failures.respond(
        409,
        "사진이 이미 변경되었어요. 새로고침 후 다시 시도해주세요",
        "conflict",
      );
    }

    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (storageError) {
      await db
        .from("landmarks")
        .update({ photo_url: photoUrl })
        .eq("id", landmarkId)
        .is("photo_url", null);
      console.error("[delete-landmark-photo] unexpected error:", storageError);
      return failures.respond(500, "서버 오류", "storage_error", {
        error: storageError,
      });
    }

    revalidatePath("/api/landmarks");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-landmark-photo] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
