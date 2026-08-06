import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getR2KeyFromPublicUrl } from "@/lib/r2";
import { isFacilityVideoKey } from "@/lib/videoUpload";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, videoUrl } = await request.json();

    if (!facilityId || !videoUrl) {
      return NextResponse.json(
        { error: "facilityId 또는 videoUrl 누락" },
        { status: 400 },
      );
    }

    // 검증 없이 저장하면 임의 URL이 시설에 심긴다. 그 값은 두 곳으로 흘러간다:
    // 공개 화면의 <video src>, 그리고 delete-facility-video가 지울 R2 키.
    // 후자는 같은 버킷의 남의 객체(명소·건물 사진) 삭제로 이어진다 —
    // delete의 `.eq("video_url", ...)` 가드는 심어둔 값과도 일치해 막지 못한다.
    const key = getR2KeyFromPublicUrl(videoUrl);
    if (!key || !isFacilityVideoKey(key, String(facilityId))) {
      return NextResponse.json(
        { error: "이 시설의 동영상 주소가 아니에요" },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("building_facilities")
      .update({ video_url: videoUrl })
      .eq("id", facilityId);

    if (error) {
      console.error("[facility-video-confirm] db error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[facility-video-confirm]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
