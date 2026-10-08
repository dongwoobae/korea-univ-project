import { NextResponse } from "next/server";
import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    photoId?: unknown;
  } | null;
  if (typeof body?.photoId !== "string") {
    return NextResponse.json({ error: "사진 ID 누락" }, { status: 400 });
  }
  if (!isUuid(body.photoId)) {
    return NextResponse.json({ error: "사진이 없어요" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: photo, error: lookupError } = await db
    .from("facility_photos")
    .select("id, storage_path")
    .eq("id", body.photoId)
    .maybeSingle();
  if (lookupError) {
    console.error("[delete-facility-photo] lookup failed", {
      message: lookupError.message,
    });
    return NextResponse.json(
      { error: "사진 정보를 불러오지 못했어요" },
      { status: 500 },
    );
  }
  if (!photo)
    return NextResponse.json({ error: "사진이 없어요" }, { status: 404 });

  // 파일이 남은 채 행만 지우면 공개 버킷에 아무도 모르는 파일이 남는다.
  if (!(await removeObject(FACILITY_PHOTO_BUCKET, photo.storage_path))) {
    return NextResponse.json(
      { error: "사진 파일을 지우지 못했어요" },
      { status: 500 },
    );
  }
  const { error } = await db
    .from("facility_photos")
    .delete()
    .eq("id", photo.id);
  if (error) {
    console.error("[delete-facility-photo] row delete failed", {
      message: error.message,
    });
    return NextResponse.json(
      { error: "사진 정보를 지우지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
