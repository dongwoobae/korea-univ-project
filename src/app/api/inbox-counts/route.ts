import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = supabaseAdmin();
  const [requests, feedback] = await Promise.all([
    db
      .from("facility_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    db
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);
  if (requests.error || feedback.error) {
    console.error("[inbox-counts] count failed", {
      requests: requests.error?.code,
      feedback: feedback.error?.code,
    });
    return Response.json(
      { error: "개수를 불러오지 못했어요" },
      { status: 500 },
    );
  }
  return Response.json({
    requests: requests.count ?? 0,
    feedback: feedback.count ?? 0,
  });
}
