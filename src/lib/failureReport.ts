import {
  isActionKey,
  isAuditTable,
  type ActionKey,
  type AuditTable,
} from "./activityLabels";
import {
  clip,
  isReportableReason,
  MESSAGE_LIMIT,
  redact,
  sanitizeDetail,
  type FailureDetail,
  type ReasonCode,
} from "./failureReason";

/** 브라우저가 `POST /api/activity-logs`로 보내는 실패 보고. 설계: docs/specs/2026-10-19-activity-log-design.md 4.3 */
export type FailureReport = {
  v: 1;
  client_event_id: string;
  owner_user_id: string;
  occurred_at: string;
  level: "warning" | "error";
  action: ActionKey;
  reason_code: ReasonCode;
  message: string;
  detail: FailureDetail;
  target_table: AuditTable | null;
  target_id: string | null;
  target_label: string | null;
};

export const MAX_REPORTS_PER_REQUEST = 50;
const TARGET_TEXT_LIMIT = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? clip(value, TARGET_TEXT_LIMIT) : undefined;
}

function parseReport(item: unknown): FailureReport | null {
  if (typeof item !== "object" || item === null) return null;
  const r = item as Record<string, unknown>;
  const targetTable = r.target_table ?? null;
  const targetId = optionalText(r.target_id);
  const targetLabel = optionalText(r.target_label);
  const detail = r.detail ?? {};
  if (
    r.v !== 1 ||
    typeof r.client_event_id !== "string" ||
    !UUID.test(r.client_event_id) ||
    typeof r.owner_user_id !== "string" ||
    typeof r.occurred_at !== "string" ||
    (r.level !== "warning" && r.level !== "error") ||
    !isActionKey(r.action) ||
    !isReportableReason(r.reason_code) ||
    typeof r.message !== "string" ||
    !(targetTable === null || isAuditTable(targetTable)) ||
    targetId === undefined ||
    targetLabel === undefined ||
    typeof detail !== "object" ||
    detail === null ||
    Array.isArray(detail)
  ) {
    return null;
  }
  return {
    v: 1,
    client_event_id: r.client_event_id,
    owner_user_id: r.owner_user_id,
    occurred_at: r.occurred_at,
    level: r.level,
    action: r.action,
    reason_code: r.reason_code,
    message: clip(redact(r.message), MESSAGE_LIMIT),
    detail: sanitizeDetail(detail as Record<string, unknown>),
    target_table: targetTable,
    target_id: targetId,
    target_label: targetLabel,
  };
}

/** 묶음 안에 하나라도 허용 목록 밖 값이 있으면 null(설계 4.3의 400). */
export function parseReports(body: unknown): FailureReport[] | null {
  if (typeof body !== "object" || body === null) return null;
  const reports = (body as { reports?: unknown }).reports;
  if (
    !Array.isArray(reports) ||
    reports.length === 0 ||
    reports.length > MAX_REPORTS_PER_REQUEST
  ) {
    return null;
  }
  const parsed: FailureReport[] = [];
  for (const item of reports) {
    const report = parseReport(item);
    if (!report) return null;
    parsed.push(report);
  }
  return parsed;
}

/** 미래이거나 30일보다 오래된 발생 시각은 받은 시각으로 바꾼다(설계 4.3). */
export function acceptedOccurredAt(value: string, now: number): string {
  const at = Date.parse(value);
  const received = new Date(now).toISOString();
  if (Number.isNaN(at) || at > now || at < now - MAX_AGE_MS) return received;
  return new Date(at).toISOString();
}
