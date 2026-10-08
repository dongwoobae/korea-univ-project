import { getAdminPageRange } from "@/lib/adminList";
import {
  feedbackStatusesFor,
  parseInboxFilter,
  type FeedbackItem,
} from "@/lib/inboxStatus";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// feedback_submissions는 anon·authenticated 권한이 막혀 있어 서비스 키로 읽는다.
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const statuses = feedbackStatusesFor(
    parseInboxFilter(url.searchParams.get("status")),
  );
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const { from, to } = getAdminPageRange(page);

  let query = supabaseAdmin()
    .from("feedback_submissions")
    .select("id, feedback_type, content, page_url, status, created_at", {
      count: "exact",
    });
  if (statuses) query = query.in("status", statuses);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  if (error) {
    console.error("[admin-feedback] list failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: "피드백을 불러오지 못했어요" },
      { status: 500 },
    );
  }
  return Response.json({
    items: (data ?? []) as FeedbackItem[],
    total: count ?? 0,
  });
}
