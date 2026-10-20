import { actionLabel, type ActionKey } from "./activityLabels";

/** 실패 사유 분류. 서버와 브라우저가 같이 쓴다. 설계: docs/specs/2026-10-19-activity-log-design.md 4.4·4.5 */

export const REASON_CODES = [
  "network",
  "timeout",
  "payload_too_large",
  "invalid_input",
  "unsupported_type",
  "session_expired",
  "forbidden",
  "conflict",
  "not_found",
  "storage_error",
  "translation_error",
  "server_error",
  "unknown",
  "audit_write_failed",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** `audit_write_failed`는 트리거만 쓴다. 브라우저 보고로는 받지 않는다. */
export function isReportableReason(
  value: unknown,
): value is Exclude<ReasonCode, "audit_write_failed"> {
  return (
    typeof value === "string" &&
    value !== "audit_write_failed" &&
    (REASON_CODES as readonly string[]).includes(value)
  );
}

export type FailureDetail = {
  status?: number;
  code?: string;
  error_message?: string;
  file_size?: number;
  file_type?: string;
  limit?: number;
  route?: string;
  truncated?: true;
};

export type FailureContext = {
  action: ActionKey;
  route?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
  /** 라우트가 응답에 실은 사유 문장. 입력 오류·충돌·없음 사유에 붙인다. */
  reasonText?: string;
};

export type FailureSource =
  | { kind: "thrown"; error: unknown }
  | { kind: "response"; status: number; vercelError?: string | null }
  | {
      kind: "postgrest";
      status?: number;
      error: { code?: string; message?: string };
    }
  | { kind: "known"; reason: ReasonCode; status?: number; error?: unknown };

export type ClassifiedFailure = {
  reason_code: ReasonCode;
  message: string;
  detail: FailureDetail;
};

export const MESSAGE_LIMIT = 300;
const ERROR_MESSAGE_LIMIT = 500;
const DETAIL_BYTE_LIMIT = 4096;

export function clip(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

/** 지울 수 없는 로그에 토큰·서명 URL이 남지 않게 가린다(설계 4.4). */
export function redact(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [가림]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[가림]");
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function fitDetail(
  detail: FailureDetail,
  maxBytes = DETAIL_BYTE_LIMIT,
): FailureDetail {
  if (byteLength(detail) <= maxBytes) return detail;
  const fitted: FailureDetail = { truncated: true };
  for (const [key, value] of Object.entries(detail)) {
    const next = { ...fitted, [key]: value };
    if (byteLength(next) > maxBytes) break;
    Object.assign(fitted, { [key]: value });
  }
  return fitted;
}

/** 허용한 키만 남긴다. 오류 객체나 응답 본문을 통째로 넣지 않는다(설계 4.4). */
export function sanitizeDetail(raw: Record<string, unknown>): FailureDetail {
  const detail: FailureDetail = {};
  if (typeof raw.status === "number") detail.status = raw.status;
  if (typeof raw.code === "string" && raw.code !== "")
    detail.code = clip(raw.code, 50);
  if (typeof raw.error_message === "string" && raw.error_message !== "")
    detail.error_message = clip(redact(raw.error_message), ERROR_MESSAGE_LIMIT);
  if (typeof raw.file_size === "number") detail.file_size = raw.file_size;
  if (typeof raw.file_type === "string" && raw.file_type !== "")
    detail.file_type = clip(raw.file_type, 100);
  if (typeof raw.limit === "number") detail.limit = raw.limit;
  if (typeof raw.route === "string" && raw.route !== "")
    detail.route = clip(redact(raw.route.split("?")[0]), 200);
  return fitDetail(detail);
}

function reasonOf(source: FailureSource): ReasonCode {
  switch (source.kind) {
    case "known":
      return source.reason;
    case "thrown":
      if (source.error instanceof Error && source.error.name === "TimeoutError")
        return "timeout";
      return source.error instanceof TypeError ? "network" : "unknown";
    case "response": {
      const status = source.status;
      if (status === 504) return "timeout";
      if (status === 413) return "payload_too_large";
      if (status === 401) return "session_expired";
      if (status === 403) return "forbidden";
      if (status === 404) return "not_found";
      if (status === 409) return "conflict";
      if (status === 415) return "unsupported_type";
      if (status === 400) return "invalid_input";
      return status >= 500 ? "server_error" : "unknown";
    }
    case "postgrest": {
      const code = source.error.code;
      if (code === "PGRST301" || source.status === 401)
        return "session_expired";
      if (code === "42501" || source.status === 403) return "forbidden";
      if (code === "23505" || code === "23503") return "conflict";
      if (code === "PGRST116") return "not_found";
      return (source.status ?? 0) >= 500 ? "server_error" : "unknown";
    }
  }
}

function errorParts(error: unknown): { code?: string; message?: string } {
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  return typeof error === "string" ? { message: error } : {};
}

function sourceParts(source: FailureSource): {
  status?: number;
  code?: string;
  message?: string;
} {
  switch (source.kind) {
    case "known":
      return { status: source.status, ...errorParts(source.error) };
    case "thrown":
      return errorParts(source.error);
    case "response":
      return {
        status: source.status,
        code: source.vercelError ?? undefined,
      };
    case "postgrest":
      return {
        status: source.status,
        code: source.error.code,
        message: source.error.message,
      };
  }
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const withText = (base: string, text?: string) =>
  text ? `${base}: ${text}` : base;

function sentence(
  reason: ReasonCode,
  detail: FailureDetail,
  context: FailureContext,
): string {
  switch (reason) {
    case "network":
      return "네트워크 연결이 끊겨 서버에 닿지 못함";
    case "timeout":
      return "서버 처리 시간이 초과됨";
    case "payload_too_large":
      return detail.file_size !== undefined && detail.limit !== undefined
        ? `파일 ${megabytes(detail.file_size)}가 서버 한도 ${megabytes(detail.limit)}를 넘음`
        : "파일이 서버 한도를 넘음";
    case "invalid_input":
      return withText("입력값이 올바르지 않음", context.reasonText);
    case "unsupported_type":
      return detail.file_type
        ? `지원하지 않는 형식(${detail.file_type})`
        : "지원하지 않는 형식";
    case "session_expired":
      return "로그인이 만료됨";
    case "forbidden":
      return "관리자 목록에 없는 계정";
    case "conflict":
      return (
        context.reasonText ??
        (detail.code === "23503"
          ? "연결된 항목이 있어 지울 수 없음"
          : "같은 항목이 이미 있음")
      );
    case "not_found":
      return context.reasonText ?? "대상이 이미 지워졌거나 없음";
    case "storage_error":
      return withText("파일 저장소가 거부함", detail.error_message);
    case "translation_error":
      return withText("번역 API 오류", detail.error_message);
    case "server_error":
      return withText("서버 내부 오류", detail.error_message);
    case "audit_write_failed":
      return withText("변경 기록 실패", detail.error_message);
    case "unknown":
      return withText("알 수 없는 오류", detail.error_message);
  }
}

export function classifyFailure(
  source: FailureSource,
  context: FailureContext,
): ClassifiedFailure {
  const reason = reasonOf(source);
  const parts = sourceParts(source);
  const detail = sanitizeDetail({
    status: parts.status,
    code: parts.code,
    error_message: parts.message,
    file_size: context.fileSize,
    file_type: context.fileType,
    limit: context.limit,
    route: context.route,
  });
  const message = clip(
    `${actionLabel(context.action)} 실패: ${sentence(reason, detail, context)}`,
    MESSAGE_LIMIT,
  );
  return { reason_code: reason, message, detail };
}

/** 저장은 됐지만 뒤따르는 일이 실패했거나 `forbidden`이면 warning(설계 4.5). */
export function failureLevel(
  reason: ReasonCode,
  followUp = false,
): "warning" | "error" {
  return followUp || reason === "forbidden" ? "warning" : "error";
}
