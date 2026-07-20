import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { Database } from "@supabase-types";
import { requireAdmin } from "@/lib/requireAdmin";
import { r2, R2_BUCKET, getR2KeyFromPublicUrl } from "@/lib/r2";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const { landmarkId, photoUrl } = await request.json();

    if (!landmarkId || !photoUrl) {
      return NextResponse.json(
        { error: "landmarkId 또는 photoUrl 누락" },
        { status: 400 },
      );
    }

    if (typeof landmarkId !== "string" || !UUID_RE.test(landmarkId)) {
      return NextResponse.json(
        { error: "잘못된 명소 ID" },
        { status: 400 },
      );
    }

    const key = getR2KeyFromPublicUrl(photoUrl);
    console.log(`[delete-landmark-photo] landmarkId=${landmarkId} key=${key}`);

    if (key) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }

    const { data: updated, error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: null })
      .eq("id", landmarkId)
      .select("id");

    if (dbError) {
      console.error("[delete-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "명소를 찾을 수 없어요" },
        { status: 404 },
      );
    }

    revalidatePath("/api/landmarks");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
