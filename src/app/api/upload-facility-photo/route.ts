import { NextResponse } from "next/server";
import {
  FACILITY_PHOTO_BUCKET,
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
  MULTIPART_OVERHEAD_BYTES,
} from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeObject, uploadPhoto } from "@/lib/server/requestPhotoStorage";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";
import { WEBP_SNIFF_BYTES, isWebP } from "@/lib/webpBytes";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/upload-facility-photo",
    action: "facility_photo.upload",
    actor: { kind: "admin", user: auth.user },
  });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FACILITY_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return failures.respond(
      413,
      "사진은 4MB까지 올릴 수 있어요",
      "payload_too_large",
      {
        fileSize: contentLength,
        limit: MAX_FACILITY_PHOTO_BYTES,
      },
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
    return failures.respond(400, "파일 또는 시설 ID 누락", "invalid_input");
  }
  failures.setTarget({ table: "building_facilities", id: facilityId });
  if (!isUuid(facilityId)) {
    return failures.respond(404, "시설이 없어요", "not_found");
  }
  if (file.size > MAX_FACILITY_PHOTO_BYTES) {
    return failures.respond(
      413,
      "사진은 4MB까지 올릴 수 있어요",
      "payload_too_large",
      {
        fileSize: file.size,
        limit: MAX_FACILITY_PHOTO_BYTES,
      },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes.subarray(0, WEBP_SNIFF_BYTES), bytes.length)) {
    return failures.respond(
      400,
      "WebP 이미지만 올릴 수 있어요",
      "unsupported_type",
      { fileType: file.type },
    );
  }

  const db = supabaseAdmin({ userId: auth.user.id });
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
    return failures.respond(
      500,
      "시설 정보를 불러오지 못했어요",
      "server_error",
      {
        error: facilityResult.error ?? existingResult.error,
      },
    );
  }
  if (!facilityResult.data)
    return failures.respond(404, "시설이 없어요", "not_found");
  const used = new Set(
    (existingResult.data ?? []).map((photo) => photo.sort_order),
  );
  const slot = Array.from(
    { length: MAX_FACILITY_PHOTOS },
    (_, index) => index,
  ).find((index) => !used.has(index));
  if (slot === undefined) {
    return failures.respond(409, "사진은 3장까지예요", "conflict");
  }

  const path = await uploadPhoto(FACILITY_PHOTO_BUCKET, facilityId, bytes);
  if (!path)
    return failures.respond(500, "사진을 올리지 못했어요", "storage_error");

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
    return conflict
      ? failures.respond(
          409,
          "동시에 올라온 사진이 있어요. 다시 시도해 주세요",
          "conflict",
        )
      : failures.respond(500, "사진을 저장하지 못했어요", "server_error", {
          error,
        });
  }
  return NextResponse.json({ id: inserted.id, storage_path: path });
}
