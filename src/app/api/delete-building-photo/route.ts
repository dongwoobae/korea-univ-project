import { NextResponse } from "next/server";
import {
  BUILDING_PHOTO_BUCKET,
  buildingPhotoPathFromUrl,
} from "@/lib/buildingPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/delete-building-photo",
    action: "building_photo.delete",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const { photoId, url } = await request.json();

    if (!photoId || !url) {
      return failures.respond(400, "photoId 또는 url 누락", "invalid_input");
    }
    failures.setTarget({ table: "building_photos", id: String(photoId) });

    const storagePath = buildingPhotoPathFromUrl(url);

    if (storagePath) {
      const { error: removeError } = await db.storage
        .from(BUILDING_PHOTO_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        console.error("[delete-building-photo] storage error:", removeError);
        return failures.respond(500, removeError.message, "storage_error", {
          error: removeError,
        });
      }
    }

    const { error: dbError } = await db
      .from("building_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      console.error("[delete-building-photo] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-building-photo] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
