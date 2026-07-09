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
    const formData = await request.formData();
    const file = formData.get("file");
    const buildingId = formData.get("buildingId");

    if (!file || !buildingId) {
      return NextResponse.json({ error: "파일 또는 건물 ID 누락" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${buildingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

    console.log(`[upload-building-photo] buildingId=${buildingId} size=${buffer.length}`);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("building-photos")
      .upload(fileName, buffer, { contentType: "image/webp" });

    if (uploadError) {
      console.error("[upload-building-photo] storage error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage
      .from("building-photos")
      .getPublicUrl(fileName);

    const url = `${data.publicUrl}?t=${Date.now()}`;

    const { data: photo, error: dbError } = await supabaseAdmin
      .from("building_photos")
      .insert({ building_id: Number(buildingId), url })
      .select("id, url")
      .single();

    if (dbError) {
      console.error("[upload-building-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log("[upload-building-photo] success:", photo.url);
    return NextResponse.json({ id: photo.id, url: photo.url });
  } catch (err) {
    console.error("[upload-building-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
