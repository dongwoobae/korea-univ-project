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
    const { photoId, url } = await request.json();

    if (!photoId || !url) {
      return NextResponse.json({ error: "photoId 또는 url 누락" }, { status: 400 });
    }

    const storagePath = url.split("/building-photos/")[1]?.split("?")[0];
    console.log(`[delete-building-photo] photoId=${photoId} path=${storagePath}`);

    if (storagePath) {
      const { error: removeError } = await supabaseAdmin.storage
        .from("building-photos")
        .remove([storagePath]);
      if (removeError) {
        console.error("[delete-building-photo] storage error:", removeError);
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }

    const { error: dbError } = await supabaseAdmin
      .from("building_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      console.error("[delete-building-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log("[delete-building-photo] success");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-building-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
