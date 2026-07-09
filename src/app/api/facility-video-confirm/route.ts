import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { facilityId, videoUrl } = await request.json();

    if (!facilityId || !videoUrl) {
      return NextResponse.json({ error: "facilityId 또는 videoUrl 누락" }, { status: 400 });
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
