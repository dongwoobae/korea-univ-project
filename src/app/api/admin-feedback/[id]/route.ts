import { isFeedbackStatus } from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (!isFeedbackStatus(body?.status)) {
    return Response.json(
      { error: "상태 값이 올바르지 않아요" },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin()
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
    return Response.json({ error: "상태를 바꾸지 못했어요" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return Response.json({ error: "피드백이 없어요" }, { status: 404 });
  }
  return Response.json({ status: body.status });
}
