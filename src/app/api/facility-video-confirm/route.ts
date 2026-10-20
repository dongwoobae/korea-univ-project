import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getR2KeyFromPublicUrl } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isFacilityVideoKey, isPosterKeyFor } from "@/lib/videoUpload";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/facility-video-confirm",
    action: "facility_video.upload",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const { facilityId, videoUrl, posterUrl } = await request.json();

    if (!facilityId || !videoUrl) {
      return failures.respond(
        400,
        "facilityId 또는 videoUrl 누락",
        "invalid_input",
      );
    }
    failures.setTarget({
      table: "building_facilities",
      id: String(facilityId),
    });

    // 검증 없이 저장하면 임의 URL이 시설에 심긴다. 그 값은 두 곳으로 흘러간다:
    // 공개 화면의 <video src>, 그리고 delete-facility-video가 지울 R2 키.
    // 후자는 같은 버킷의 남의 객체(명소·건물 사진) 삭제로 이어진다 —
    // delete의 `.eq("video_url", ...)` 가드는 심어둔 값과도 일치해 막지 못한다.
    const key = getR2KeyFromPublicUrl(videoUrl);
    if (!key || !isFacilityVideoKey(key, String(facilityId))) {
      return failures.respond(
        400,
        "이 시설의 동영상 주소가 아니에요",
        "invalid_input",
      );
    }

    let posterValue: string | null = null;
    if (posterUrl !== undefined && posterUrl !== null) {
      const posterKey =
        typeof posterUrl === "string" ? getR2KeyFromPublicUrl(posterUrl) : null;
      if (!posterKey || !isPosterKeyFor(posterKey, key)) {
        return failures.respond(
          400,
          "이 동영상의 포스터 주소가 아니에요",
          "invalid_input",
        );
      }
      posterValue = posterUrl;
    }

    const { error } = await db
      .from("building_facilities")
      .update({ video_url: videoUrl, video_poster_url: posterValue })
      .eq("id", facilityId);

    if (error) {
      console.error("[facility-video-confirm] db error:", error);
      return failures.respond(500, error.message, "server_error", { error });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[facility-video-confirm]", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
