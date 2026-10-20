import { NextResponse } from "next/server";
import { acceptedOccurredAt, parseReports } from "@/lib/failureReport";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** 브라우저 실패 보고를 받는다. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const reports = parseReports(await request.json().catch(() => null));
  if (!reports) {
    return NextResponse.json(
      { error: "보고 형식이 올바르지 않아요" },
      { status: 400 },
    );
  }

  const actorLabel = auth.admin.displayName;
  const now = Date.now();
  const rows = reports
    .filter((report) => report.owner_user_id === auth.user.id)
    .map((report) => ({
      occurred_at: acceptedOccurredAt(report.occurred_at, now),
      level: report.level,
      kind: "failure",
      actor_kind: "admin",
      actor_id: auth.user.id,
      actor_label: actorLabel,
      action: report.action,
      target_table: report.target_table,
      target_id: report.target_id,
      target_label: report.target_label,
      reason_code: report.reason_code,
      message: report.message,
      detail: report.detail,
      client_event_id: report.client_event_id,
    }));
  if (rows.length === 0) return NextResponse.json({ accepted: 0 });

  const { error } = await supabaseAdmin()
    .from("activity_logs")
    .upsert(rows, { onConflict: "client_event_id", ignoreDuplicates: true });
  if (error) {
    console.error("[activity-logs] insert failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "보고를 저장하지 못했어요" },
      { status: 500 },
    );
  }
  return NextResponse.json({ accepted: rows.length });
}
