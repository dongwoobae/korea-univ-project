import { NextResponse } from "next/server";
import {
  BUILDING_PHOTO_BUCKET,
  buildingPhotoPathFromUrl,
} from "@/lib/buildingPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const { photoId, url } = await request.json();

    if (!photoId || !url) {
      return NextResponse.json(
        { error: "photoId 또는 url 누락" },
        { status: 400 },
      );
    }

    const storagePath = buildingPhotoPathFromUrl(url);

    if (storagePath) {
      const { error: removeError } = await db.storage
        .from(BUILDING_PHOTO_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        console.error("[delete-building-photo] storage error:", removeError);
        return NextResponse.json(
          { error: removeError.message },
          { status: 500 },
        );
      }
    }

    const { error: dbError } = await db
      .from("building_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      console.error("[delete-building-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-building-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
