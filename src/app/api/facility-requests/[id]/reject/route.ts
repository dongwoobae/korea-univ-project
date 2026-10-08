import { requireAdmin } from "@/lib/requireAdmin";
import { cleanupRequestPhotos } from "@/lib/server/requestPhotoStorage";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data, error } = await supabaseAdmin()
    .from("facility_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["new", "reviewing"])
    .select("id");
  if (error) {
    console.error("[facility-requests] reject failed", {
      id,
      code: error.code,
    });
    return Response.json({ error: "거절하지 못했어요" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return Response.json({ error: "이미 처리된 요청이에요" }, { status: 409 });
  }

  const cleaned = await cleanupRequestPhotos(id);
  return Response.json({ ok: true, cleanupFailed: !cleaned });
}
