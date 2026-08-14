import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";
import { isFacilityVideoKey } from "@/lib/videoUpload";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, videoUrl } = await request.json();

    if (
      typeof facilityId !== "string" ||
      typeof videoUrl !== "string" ||
      !facilityId ||
      !videoUrl
    ) {
      return NextResponse.json(
        { error: "facilityId 또는 videoUrl 누락" },
        { status: 400 },
      );
    }

    // 지울 키는 **DB에 저장된 값**에서 뽑는다. 클라이언트가 준 URL을 그대로
    // 키로 쓰면 남의 객체를 가리킬 수 있다. 클라이언트 값은 아래 update의
    // 조건으로만 써서 "그 사이 바뀌었는지"를 보는 용도로 남긴다.
    const { data: current, error: readError } = await supabaseAdmin
      .from("building_facilities")
      .select("video_url")
      .eq("id", facilityId)
      .maybeSingle();

    if (readError) {
      console.error("[delete-facility-video] db read error:", readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!current?.video_url) {
      return NextResponse.json(
        { error: "동영상이 이미 변경되었어요" },
        { status: 409 },
      );
    }

    const key = getR2KeyFromPublicUrl(current.video_url);
    // 저장된 값이라도 믿지 않는다. 과거에 검증 없이 심긴 값이 남아 있을 수 있다.
    if (!key || !isFacilityVideoKey(key, String(facilityId))) {
      console.error(
        `[delete-facility-video] 이 시설의 키가 아님 facilityId=${facilityId}`,
      );
      return NextResponse.json({ error: "잘못된 동영상 URL" }, { status: 400 });
    }

    const { data: updated, error: dbError } = await supabaseAdmin
      .from("building_facilities")
      .update({ video_url: null })
      .eq("id", facilityId)
      .eq("video_url", videoUrl)
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("[delete-facility-video] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: "동영상이 이미 변경되었어요" },
        { status: 409 },
      );
    }

    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (storageError) {
      await supabaseAdmin
        .from("building_facilities")
        .update({ video_url: videoUrl })
        .eq("id", facilityId)
        .is("video_url", null);
      throw storageError;
    }

    revalidatePath("/api/facilities");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-facility-video] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
