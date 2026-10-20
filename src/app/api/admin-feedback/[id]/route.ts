import { isFeedbackStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { routeFailures } from "@/lib/server/routeFailures";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUuid } from "@/lib/uuid";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const failures = routeFailures({
    route: "/api/admin-feedback/[id]",
    action: "feedback.status",
    actor: { kind: "admin", user: auth.user },
  });

  const { id } = await params;
  failures.setTarget({ table: "feedback_submissions", id });
  if (!isUuid(id))
    return failures.respond(404, "피드백을 찾을 수 없어요", "not_found");
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (!isFeedbackStatus(body?.status)) {
    return failures.respond(400, "상태 값이 올바르지 않아요", "invalid_input");
  }
  const { data, error } = await supabaseAdmin({ userId: auth.user.id })
    .from("feedback_submissions")
    .update({ status: body.status })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[admin-feedback] update failed", {
      id,
      code: error.code,
      message: error.message,
    });
    return failures.respond(500, "상태를 바꾸지 못했어요", "server_error", {
      error,
    });
  }
  if (!data || data.length === 0) {
    return failures.respond(404, "피드백이 없어요", "not_found");
  }
  return Response.json({ status: body.status });
}
