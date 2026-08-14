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
      return NextResponse.json({ error: "잘못된 명소 ID" }, { status: 400 });
    }

    if (typeof photoUrl !== "string") {
      return NextResponse.json({ error: "잘못된 사진 URL" }, { status: 400 });
    }
    const key = getR2KeyFromPublicUrl(photoUrl);
    if (!key) {
      return NextResponse.json({ error: "잘못된 사진 URL" }, { status: 400 });
    }
    const { data: updated, error: dbError } = await supabaseAdmin
      .from("landmarks")
      .update({ photo_url: null })
      .eq("id", landmarkId)
      .eq("photo_url", photoUrl)
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("[delete-landmark-photo] db error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: "사진이 이미 변경되었어요. 새로고침 후 다시 시도해주세요" },
        { status: 409 },
      );
    }

    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (storageError) {
      await supabaseAdmin
        .from("landmarks")
        .update({ photo_url: photoUrl })
        .eq("id", landmarkId)
        .is("photo_url", null);
      throw storageError;
    }

    revalidatePath("/api/landmarks");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-landmark-photo] unexpected error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
