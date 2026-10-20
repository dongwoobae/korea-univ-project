import { NextResponse } from "next/server";
import {
  BUILDING_PHOTO_BUCKET,
  BUILDING_PHOTO_CACHE_CONTROL,
  buildingPhotoPath,
} from "@/lib/buildingPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isWebP } from "@/lib/webpBytes";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/upload-building-photo",
    action: "building_photo.upload",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const buildingId = formData.get("buildingId");

    if (!(file instanceof File) || !buildingId) {
      return failures.respond(400, "파일 또는 건물 ID 누락", "invalid_input");
    }
    failures.setTarget({ table: "buildings", id: String(buildingId) });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isWebP(buffer, buffer.length)) {
      return failures.respond(
        400,
        "WebP 이미지만 올릴 수 있어요",
        "unsupported_type",
      );
    }
    const fileName = buildingPhotoPath(
      String(buildingId),
      Date.now(),
      Math.random().toString(36).slice(2),
    );

    const { error: uploadError } = await db.storage
      .from(BUILDING_PHOTO_BUCKET)
      .upload(fileName, buffer, {
        contentType: "image/webp",
        cacheControl: BUILDING_PHOTO_CACHE_CONTROL,
      });

    if (uploadError) {
      console.error("[upload-building-photo] storage error:", uploadError);
      return failures.respond(500, uploadError.message, "storage_error", {
        error: uploadError,
      });
    }

    const { data } = db.storage
      .from(BUILDING_PHOTO_BUCKET)
      .getPublicUrl(fileName);

    const url = `${data.publicUrl}?t=${Date.now()}`;

    const { data: photo, error: dbError } = await db
      .from("building_photos")
      .insert({ building_id: Number(buildingId), url })
      .select("id, url")
      .single();

    if (dbError) {
      console.error("[upload-building-photo] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    return NextResponse.json({ id: photo.id, url: photo.url });
  } catch (err) {
    console.error("[upload-building-photo] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
