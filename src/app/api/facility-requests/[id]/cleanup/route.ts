import { isEndStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { cleanupRequestPhotos } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isUuid(id))
    return Response.json({ error: "요청이 없어요" }, { status: 404 });

  const { data: row, error } = await supabaseAdmin()
    .from("facility_requests")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[facility-requests] cleanup lookup failed", {
      id,
      code: error.code,
    });
    return Response.json(
      { error: "요청을 불러오지 못했어요" },
      { status: 500 },
    );
  }
  if (!row || !isEndStatus(row.status)) {
    return Response.json(
      { error: "처리가 끝난 요청만 정리할 수 있어요" },
      { status: 409 },
    );
  }
  if (!(await cleanupRequestPhotos(id))) {
    return Response.json({ error: "사진을 지우지 못했어요" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
