import type { ActionKey, AuditTable } from "@/lib/activityLabels";
import {
  classifyFailure,
  failureLevel,
  type FailureSource,
} from "@/lib/failureReason";
import type { FailureReport } from "@/lib/failureReport";
import { supabase } from "@/lib/supabaseClient";

/** 브라우저 실패 보고와 그 대기열. 설계: docs/specs/2026-10-19-activity-log-design.md 4.1·4.3 */

const ENDPOINT = "/api/activity-logs";
const QUEUE_KEY = "ku-activity-report-queue";
const QUEUE_LIMIT = 50;
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export type ReportInput = {
  source: FailureSource;
  action: ActionKey;
  followUp?: boolean;
  target?: { table: AuditTable; id?: string | null; label?: string | null };
  route?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
};

type SendOutcome = "sent" | "retry" | "drop";

function readQueue(): FailureReport[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(QUEUE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is FailureReport =>
            typeof item === "object" &&
            item !== null &&
            item.v === 1 &&
            typeof item.owner_user_id === "string" &&
            typeof item.client_event_id === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeQueue(items: FailureReport[]) {
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items.slice(-QUEUE_LIMIT)),
    );
  } catch {
    // 저장소를 못 쓰면 이 보고만 잃는다(설계 4.3).
  }
}

async function session() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function send(reports: FailureReport[]): Promise<SendOutcome> {
  const token = (await session())?.access_token;
  if (!token) return "retry";
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reports }),
    });
  } catch {
    return "retry";
  }
  if (response.ok) return "sent";
  // 403: 목록에 없는 계정의 보고는 다시 보내도 받지 않는다. 400: 다시 보내도 같은 이유로 거절된다.
  return response.status === 403 || response.status === 400 ? "drop" : "retry";
}

/** 지금 로그인한 계정의 대기 항목만 보낸다. 다른 계정의 항목은 그 사람이 다시 로그인할 때 나간다. */
export async function flushQueue(): Promise<void> {
  try {
    const owner = (await session())?.user.id;
    if (!owner) return;
    const mine = readQueue()
      .filter((report) => report.owner_user_id === owner)
      .slice(0, QUEUE_LIMIT);
    if (mine.length === 0) return;
    if ((await send(mine)) === "retry") return;
    const done = new Set(mine.map((report) => report.client_event_id));
    writeQueue(
      readQueue().filter((report) => !done.has(report.client_event_id)),
    );
  } catch (error) {
    console.error("[activity-report] flush failed", error);
  }
}

export async function reportFailure(input: ReportInput): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const owner = (await session())?.user.id;
    if (!owner) return;
    const { reason_code, message, detail } = classifyFailure(input.source, {
      action: input.action,
      route: input.route,
      fileSize: input.fileSize,
      fileType: input.fileType,
      limit: input.limit,
    });
    const report: FailureReport = {
      v: 1,
      client_event_id: crypto.randomUUID(),
      owner_user_id: owner,
      occurred_at: new Date().toISOString(),
      level: failureLevel(reason_code, input.followUp),
      action: input.action,
      reason_code,
      message,
      detail,
      target_table: input.target?.table ?? null,
      target_id: input.target?.id ?? null,
      target_label: input.target?.label ?? null,
    };
    const outcome = await send([report]);
    if (outcome === "retry") writeQueue([...readQueue(), report]);
    if (outcome === "sent") await flushQueue();
  } catch (error) {
    console.error("[activity-report] report failed", error);
  }
}

const API_ACTIONS: [RegExp, ActionKey][] = [
  [/^\/api\/upload-building-photo$/, "building_photo.upload"],
  [/^\/api\/delete-building-photo$/, "building_photo.delete"],
  [/^\/api\/upload-facility-photo$/, "facility_photo.upload"],
  [/^\/api\/delete-facility-photo$/, "facility_photo.delete"],
  [/^\/api\/delete-facility-photos$/, "facility_photo.delete_all"],
  [
    /^\/api\/(upload-facility-video|facility-video-presign|facility-video-confirm)$/,
    "facility_video.upload",
  ],
  [/^\/api\/delete-facility-video$/, "facility_video.delete"],
  [/^\/api\/upload-landmark-photo$/, "landmark_photo.upload"],
  [/^\/api\/delete-landmark-photo$/, "landmark_photo.delete"],
  [/^\/api\/translate-facility$/, "facility.translate"],
  [/^\/api\/revalidate-(facilities|landmarks)$/, "public_map.revalidate"],
  [/^\/api\/admin-feedback\/[^/]+$/, "feedback.status"],
  [/^\/api\/facility-requests\/[^/]+\/status$/, "facility_request.status"],
  [/^\/api\/facility-requests\/[^/]+\/approve$/, "facility_request.approve"],
  [/^\/api\/facility-requests\/[^/]+\/reject$/, "facility_request.reject"],
  [/^\/api\/facility-requests\/[^/]+\/cleanup$/, "facility_request.cleanup"],
  [/^\/api\/settings\/feedback-emails$/, "settings.feedback_emails"],
  [/^\/api\/settings\/slope-bands$/, "settings.slope_bands"],
];

/** 경로 표에 없는 호출(읽기)은 보고하지 않는다. */
export function actionForApiRequest(
  pathname: string,
  method: string,
): ActionKey | null {
  if (method.toUpperCase() === "GET") return null;
  return API_ACTIONS.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

/** 서버 코드에 닿지 못해 서버가 기록하지 못한 응답인가(설계 4.1). */
export function missedServerLog(response: Response): boolean {
  return (
    response.headers.has("x-vercel-error") ||
    response.status === 504 ||
    response.status === 401
  );
}

function bodyFile(body: BodyInit | null | undefined): Blob | null {
  if (body instanceof Blob) return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    for (const value of body.values()) if (value instanceof Blob) return value;
  }
  return null;
}

function pathOf(input: RequestInfo | URL): string {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(href, "http://local").pathname;
}

/** `authedFetch`가 응답(또는 던져진 오류)을 넘긴다. 보고할 일이 아니면 아무것도 하지 않는다. */
export function reportApiOutcome(
  input: RequestInfo | URL,
  init: RequestInit,
  outcome: Response | unknown,
): void {
  const route = pathOf(input);
  const action = actionForApiRequest(route, init.method ?? "GET");
  if (!action) return;
  if (outcome instanceof Response) {
    if (!missedServerLog(outcome)) return;
    const file = outcome.status === 413 ? bodyFile(init.body) : null;
    void reportFailure({
      source: {
        kind: "response",
        status: outcome.status,
        vercelError: outcome.headers.get("x-vercel-error"),
      },
      action,
      route,
      ...(file
        ? {
            fileSize: file.size,
            fileType: file.type,
            limit: VERCEL_BODY_LIMIT_BYTES,
          }
        : {}),
    });
    return;
  }
  if (outcome instanceof Error && outcome.name === "AbortError") return;
  void reportFailure({
    source: { kind: "thrown", error: outcome },
    action,
    route,
  });
}
