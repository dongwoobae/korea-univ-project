import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

const OPPOSITE = { new: "reviewing", reviewing: "new" } as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/facility-requests/[id]/status",
    action: "facility_request.status",
    actor: { kind: "admin", user: auth.user },
  });
  const { id } = await params;
  failures.setTarget({ table: "facility_requests", id });
  if (!isUuid(id)) return failures.respond(404, "요청이 없어요", "not_found");
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const status = body?.status;
  if (status !== "new" && status !== "reviewing") {
    return failures.respond(400, "상태 값이 올바르지 않아요", "invalid_input");
  }

  const { data, error } = await supabaseAdmin({ userId: auth.user.id })
    .from("facility_requests")
    .update({ status })
    .eq("id", id)
    .eq("status", OPPOSITE[status])
    .select("id");
  if (error) {
    console.error("[facility-requests] status update failed", {
      id,
      code: error.code,
    });
    return failures.respond(500, "상태를 바꾸지 못했어요", "server_error", {
      error,
    });
  }
  if (!data || data.length === 0) {
    return failures.respond(
      409,
      "이미 처리됐거나 상태가 바뀐 요청이에요",
      "conflict",
    );
  }
  return Response.json({ status });
}
