import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request) {
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

    const key = getR2KeyFromPublicUrl(videoUrl);
    if (!key) {
      return NextResponse.json({ error: "잘못된 동영상 URL" }, { status: 400 });
    }

    console.log(`[delete-facility-video] facilityId=${facilityId} key=${key}`);

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

    console.log("[delete-facility-video] success");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-facility-video] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
