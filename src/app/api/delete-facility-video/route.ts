import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isFacilityVideoKey } from "@/lib/videoUpload";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/delete-facility-video",
    action: "facility_video.delete",
    actor: { kind: "admin", user: auth.user },
  });
  const db = supabaseAdmin({ userId: auth.user.id });

  try {
    const { facilityId, videoUrl } = await request.json();

    if (
      typeof facilityId !== "string" ||
      typeof videoUrl !== "string" ||
      !facilityId ||
      !videoUrl
    ) {
      return failures.respond(
        400,
        "facilityId 또는 videoUrl 누락",
        "invalid_input",
      );
    }
    failures.setTarget({ table: "building_facilities", id: facilityId });

    // 지울 키는 **DB에 저장된 값**에서 뽑는다. 클라이언트가 준 URL을 그대로
    // 키로 쓰면 남의 객체를 가리킬 수 있다. 클라이언트 값은 아래 update의
    // 조건으로만 써서 "그 사이 바뀌었는지"를 보는 용도로 남긴다.
    const { data: current, error: readError } = await db
      .from("building_facilities")
      .select("video_url, video_poster_url")
      .eq("id", facilityId)
      .maybeSingle();

    if (readError) {
      console.error("[delete-facility-video] db read error:", readError);
      return failures.respond(500, readError.message, "server_error", {
        error: readError,
      });
    }
    if (!current?.video_url) {
      return failures.respond(409, "동영상이 이미 변경되었어요", "conflict");
    }

    const key = getR2KeyFromPublicUrl(current.video_url);
    // 저장된 값이라도 믿지 않는다. 과거에 검증 없이 심긴 값이 남아 있을 수 있다.
    if (!key || !isFacilityVideoKey(key, String(facilityId))) {
      console.error(
        `[delete-facility-video] 이 시설의 키가 아님 facilityId=${facilityId}`,
      );
      return failures.respond(400, "잘못된 동영상 URL", "invalid_input");
    }

    // DB 값이 이 시설의 키가 아니면 객체는 건드리지 않고 컬럼만 비운다.
    const posterKey = current.video_poster_url
      ? getR2KeyFromPublicUrl(current.video_poster_url)
      : null;
    const deletablePosterKey =
      posterKey && isFacilityVideoKey(posterKey, String(facilityId))
        ? posterKey
        : null;

    const { data: updated, error: dbError } = await db
      .from("building_facilities")
      .update({ video_url: null, video_poster_url: null })
      .eq("id", facilityId)
      .eq("video_url", videoUrl)
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("[delete-facility-video] db error:", dbError);
      return failures.respond(500, dbError.message, "server_error", {
        error: dbError,
      });
    }

    if (!updated) {
      return failures.respond(409, "동영상이 이미 변경되었어요", "conflict");
    }

    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (storageError) {
      await db
        .from("building_facilities")
        .update({
          video_url: videoUrl,
          video_poster_url: current.video_poster_url,
        })
        .eq("id", facilityId)
        .is("video_url", null);
      console.error("[delete-facility-video] unexpected error:", storageError);
      return failures.respond(500, "서버 오류", "storage_error", {
        error: storageError,
      });
    }

    // 영상이 이미 지워졌으므로 되돌리지 않는다. DB는 포스터를 참조하지 않아 고아 jpg만 남는다.
    if (deletablePosterKey) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: deletablePosterKey,
          }),
        );
      } catch (posterError) {
        console.error(
          `[delete-facility-video] 포스터 삭제 실패 key=${deletablePosterKey}`,
          posterError,
        );
        failures.record("storage_error", {
          followUp: true,
          error: posterError,
        });
      }
    }

    revalidatePath("/api/facilities");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-facility-video] unexpected error:", err);
    return failures.respond(500, "서버 오류", "server_error", { error: err });
  }
}
