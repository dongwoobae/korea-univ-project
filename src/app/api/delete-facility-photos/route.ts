import { NextResponse } from "next/server";
import { FACILITY_PHOTO_BUCKET } from "@/lib/facilityPhotos";
import { requireAdmin } from "@/lib/requireAdmin";
import { removeFolder } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

/**
 * 시설 삭제의 사진 단계. 한 시설의 파일은 그 id 폴더에만 있으므로 폴더째 지운다 —
 * 행이 없는 파일(업로드 되돌리기 실패)도 함께 거두고, 호출부가 사진 목록을 몰라도 된다.
 * 한 장씩 지우는 것은 /api/delete-facility-photo.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    facilityId?: unknown;
  } | null;
  if (typeof body?.facilityId !== "string") {
    return NextResponse.json({ error: "시설 ID 누락" }, { status: 400 });
  }
  if (!isUuid(body.facilityId)) {
    return NextResponse.json({ error: "시설이 없어요" }, { status: 404 });
  }

  // 파일을 먼저, 행을 나중에 지운다. 행이 남아 있으면 다시 눌러 이어서 지울 수 있다.
  if (!(await removeFolder(FACILITY_PHOTO_BUCKET, body.facilityId))) {
    return NextResponse.json(
      { error: "사진 파일을 지우지 못했어요" },
      { status: 500 },
    );
  }
  const { error } = await supabaseAdmin()
    .from("facility_photos")
    .delete()
    .eq("facility_id", body.facilityId);
  if (error) {
    console.error("[delete-facility-photos] row delete failed", {
      facilityId: body.facilityId,
      message: error.message,
    });
    return NextResponse.json(
      { error: "사진 정보를 지우지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
