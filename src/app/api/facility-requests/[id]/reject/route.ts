import { requireAdmin } from "@/lib/requireAdmin";
import { cleanupRequestPhotos } from "@/lib/server/requestPhotoStorage";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/facility-requests/[id]/reject",
    action: "facility_request.reject",
    actor: { kind: "admin", user: auth.user },
  });
  const { id } = await params;
  failures.setTarget({ table: "facility_requests", id });
  if (!isUuid(id)) return failures.respond(404, "요청이 없어요", "not_found");

  const { data, error } = await supabaseAdmin({ userId: auth.user.id })
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
    return failures.respond(500, "거절하지 못했어요", "server_error", {
      error,
    });
  }
  if (!data || data.length === 0) {
    return failures.respond(409, "이미 처리된 요청이에요", "conflict");
  }

  const cleaned = await cleanupRequestPhotos(id);
  if (!cleaned)
    failures.record("storage_error", {
      action: "facility_request.cleanup",
      followUp: true,
    });
  return Response.json({ ok: true, cleanupFailed: !cleaned });
}
