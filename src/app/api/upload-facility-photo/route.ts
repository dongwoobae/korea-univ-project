import { NextResponse } from "next/server";
import {
  FACILITY_PHOTO_BUCKET,
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

// multipart 경계·필드 이름이 파일 크기에 더해진다.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  if (
    Number(request.headers.get("content-length") ?? 0) >
    MAX_FACILITY_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return NextResponse.json(
      { error: "사진은 4MB까지 올릴 수 있어요" },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const facilityId = form?.get("facilityId");
  if (
    !(file instanceof File) ||
    typeof facilityId !== "string" ||
    !facilityId
  ) {
    return NextResponse.json(
      { error: "파일 또는 시설 ID 누락" },
      { status: 400 },
    );
  }
  if (!isUuid(facilityId)) {
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  }
  if (file.size > MAX_FACILITY_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "사진은 4MB까지 올릴 수 있어요" },
      { status: 413 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes.subarray(0, WEBP_SNIFF_BYTES), bytes.length)) {
    return NextResponse.json(
      { error: "WebP 이미지만 올릴 수 있어요" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const [facilityResult, existingResult] = await Promise.all([
    db
      .from("building_facilities")
      .select("id")
      .eq("id", facilityId)
      .maybeSingle(),
    db
      .from("facility_photos")
      .select("sort_order")
      .eq("facility_id", facilityId),
  ]);
  if (facilityResult.error || existingResult.error) {
    console.error("[upload-facility-photo] lookup failed", {
      facility: facilityResult.error?.message,
      photos: existingResult.error?.message,
    });
    return NextResponse.json(
      { error: "시설 정보를 불러오지 못했어요" },
      { status: 500 },
    );
  }
  if (!facilityResult.data)
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  const used = new Set(
    (existingResult.data ?? []).map((photo) => photo.sort_order),
  );
  const slot = Array.from(
    { length: MAX_FACILITY_PHOTOS },
    (_, index) => index,
  ).find((index) => !used.has(index));
  if (slot === undefined) {
    return NextResponse.json({ error: "사진은 3장까지예요" }, { status: 409 });
  }

  const path = await uploadPhoto(FACILITY_PHOTO_BUCKET, facilityId, bytes);
  if (!path)
    return NextResponse.json(
      { error: "사진을 올리지 못했어요" },
      { status: 500 },
    );

  const { data: inserted, error } = await db
    .from("facility_photos")
    .insert({ facility_id: facilityId, storage_path: path, sort_order: slot })
    .select("id")
    .single();
  if (error || !inserted) {
    await removeObject(FACILITY_PHOTO_BUCKET, path);
    // 동시에 두 장이 같은 순서를 잡으면 (facility_id, sort_order) 유일 제약이 막는다.
    const conflict = error?.code === "23505";
    if (!conflict) {
      console.error("[upload-facility-photo] insert failed", {
        code: error?.code,
      });
    }
    return NextResponse.json(
      { error: conflict ? "사진은 3장까지예요" : "사진을 저장하지 못했어요" },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ id: inserted.id, storage_path: path });
}
