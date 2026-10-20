import { isEndStatus } from "@/lib/inboxStatus";
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
    route: "/api/facility-requests/[id]/cleanup",
    action: "facility_request.cleanup",
    actor: { kind: "admin", user: auth.user },
    followUp: true,
  });
  const { id } = await params;
  failures.setTarget({ table: "facility_requests", id });
  if (!isUuid(id)) return failures.respond(404, "요청이 없어요", "not_found");

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
    return failures.respond(500, "요청을 불러오지 못했어요", "server_error", {
      error,
    });
  }
  if (!row || !isEndStatus(row.status)) {
    return failures.respond(
      409,
      "처리가 끝난 요청만 정리할 수 있어요",
      "conflict",
    );
  }
  if (!(await cleanupRequestPhotos(id))) {
    return failures.respond(500, "사진을 지우지 못했어요", "storage_error");
  }
  return Response.json({ ok: true });
}
