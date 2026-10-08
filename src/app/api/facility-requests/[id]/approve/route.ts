import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseFacilityFields } from "@/lib/facilityFields";
import {
  FACILITY_PHOTO_BUCKET,
  MAX_FACILITY_PHOTOS,
} from "@/lib/facilityPhotos";
import { isEndStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  cleanupRequestPhotos,
  copyToFacility,
  removeFolder,
} from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    fields?: unknown;
    photoIds?: unknown;
  } | null;
  const fields = parseFacilityFields(body?.fields);
  if (!fields) return badRequest("입력값을 확인해 주세요");
  const photoIds = body?.photoIds;
  if (
    !Array.isArray(photoIds) ||
    photoIds.length > MAX_FACILITY_PHOTOS ||
    !photoIds.every((photoId) => typeof photoId === "string")
  ) {
    return badRequest("사진 선택이 올바르지 않아요");
  }

  const db = supabaseAdmin();
  const { data: type, error: typeError } = await db
    .from("facility_types")
    .select("code")
    .eq("code", fields.facility_code)
    .maybeSingle();
  if (typeError) {
    console.error("[facility-requests] approve type lookup failed", {
      id,
      code: typeError.code,
    });
    return NextResponse.json(
      { error: "시설 유형을 확인하지 못했어요" },
      { status: 500 },
    );
  }
  if (!type) return badRequest("없는 시설 유형이에요");

  // 다른 요청의 사진이 이 시설로 공개되지 않게 이 요청의 사진 중에서만 고른다(설계 4.4).
  const { data: ownPhotos, error: photoError } = await db
    .from("facility_request_photos")
    .select("id, storage_path")
    .eq("request_id", id);
  if (photoError) {
    console.error("[facility-requests] approve photo lookup failed", {
      id,
      code: photoError.code,
    });
    return NextResponse.json(
      { error: "사진을 불러오지 못했어요" },
      { status: 500 },
    );
  }
  const selected = photoIds.map((photoId) =>
    (ownPhotos ?? []).find((photo) => photo.id === photoId),
  );
  if (selected.some((photo) => !photo))
    return badRequest("이 요청의 사진이 아니에요");

  // 공개 사진 경로에 시설 id가 들어가는데 시설은 함수 안에서야 생긴다 — id를 먼저 만든다.
  const facilityId = randomUUID();

  async function abort(fallback: { error: string; status: number }) {
    // 복사가 일부만 끝났어도 같은 폴더라 함께 지워진다(설계 4.4).
    await removeFolder(FACILITY_PHOTO_BUCKET, facilityId);
    const { data: current, error: statusError } = await db
      .from("facility_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusError) {
      console.error("[facility-requests] approve status lookup failed", {
        id,
        code: statusError.code,
      });
    } else if (current && isEndStatus(current.status)) {
      return NextResponse.json(
        { error: "이미 처리된 요청이에요" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: fallback.error },
      { status: fallback.status },
    );
  }

  const copied: {
    request_photo_id: string;
    storage_path: string;
    sort_order: number;
  }[] = [];
  for (const [index, photo] of selected.entries()) {
    const destination = await copyToFacility(photo!.storage_path, facilityId);
    if (!destination)
      return abort({ error: "사진을 옮기지 못했어요", status: 500 });
    copied.push({
      request_photo_id: photo!.id,
      storage_path: destination,
      sort_order: index,
    });
  }

  const { data: result, error } = await db.rpc("approve_facility_request", {
    p_request_id: id,
    p_facility_id: facilityId,
    p_fields: { ...fields },
    p_photos: copied,
  });
  if (error || result !== "approved") {
    if (error)
      console.error("[facility-requests] approve failed", {
        id,
        code: error.code,
      });
    if (result === "photo_mismatch")
      return abort({ error: "이 요청의 사진이 아니에요", status: 400 });
    return abort({ error: "승인하지 못했어요", status: 500 });
  }

  const cleaned = await cleanupRequestPhotos(id);
  return NextResponse.json({ facilityId, cleanupFailed: !cleaned });
}
