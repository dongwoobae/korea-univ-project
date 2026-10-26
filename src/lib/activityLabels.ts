import type { Database, Json } from "@supabase-types";

/** 로그 화면의 표시 규칙. 설계: docs/specs/2026-10-19-activity-log-design.md 5.5 */

export type ActivityLogRow =
  Database["public"]["Tables"]["activity_logs"]["Row"];

export const AUDIT_TABLES = [
  "buildings",
  "building_facilities",
  "building_photos",
  "facility_photos",
  "landmarks",
  "slope_segments",
  "colleges",
  "facility_types",
  "app_settings",
  "admin_users",
  "facility_requests",
  "feedback_submissions",
] as const;
export type AuditTable = (typeof AUDIT_TABLES)[number];
export type ChangeOperation = "insert" | "update" | "delete";
export type TableActionKey = `${AuditTable}.${ChangeOperation}`;

const TABLE_LABELS: Record<AuditTable, string> = {
  buildings: "건물",
  building_facilities: "시설",
  building_photos: "건물 사진",
  facility_photos: "시설 사진",
  landmarks: "명소",
  slope_segments: "경사도 경로",
  colleges: "단과대학",
  facility_types: "시설 종류",
  app_settings: "설정",
  admin_users: "관리자",
  facility_requests: "등록 요청",
  feedback_submissions: "의견 제보",
};

const OPERATION_LABELS: Record<ChangeOperation, string> = {
  insert: "등록",
  update: "수정",
  delete: "삭제",
};

export const FAILURE_ACTION_LABELS = {
  "building_photo.upload": "건물 사진 업로드",
  "building_photo.delete": "건물 사진 삭제",
  "facility_photo.upload": "시설 사진 업로드",
  "facility_photo.delete": "시설 사진 삭제",
  "facility_photo.delete_all": "시설 사진 정리",
  "facility_video.upload": "시설 동영상 업로드",
  "facility_video.delete": "시설 동영상 삭제",
  "landmark_photo.upload": "명소 사진 업로드",
  "landmark_photo.delete": "명소 사진 삭제",
  "facility.translate": "자동 번역",
  "public_map.revalidate": "공개 지도 갱신",
  "feedback.status": "의견 상태 변경",
  "feedback.submit": "의견 제보 접수",
  "facility_request.status": "등록 요청 상태 변경",
  "facility_request.approve": "등록 요청 승인",
  "facility_request.reject": "등록 요청 거절",
  "facility_request.cleanup": "등록 요청 사진 정리",
  "facility_request.submit": "등록 요청 접수",
  "facility_request.photo_upload": "등록 요청 사진 업로드",
  "settings.feedback_emails": "제보 알림 메일 저장",
  "settings.slope_bands": "경사도 범례 저장",
  "buildings.osm_sync": "OSM 동기화",
  "admin.access": "관리자 기능 접근",
} as const;
export type NamedActionKey = keyof typeof FAILURE_ACTION_LABELS;
export type ActionKey = NamedActionKey | TableActionKey;

/** 사전 순서가 목록 요약의 "첫 번째 바뀐 칸"을 정한다. */
const COLUMN_LABELS = new Map<string, string>([
  ["name", "이름"],
  ["label", "이름"],
  ["display_name", "표시 이름"],
  ["is_installed", "설치 여부"],
  ["is_deleted", "삭제 여부"],
  ["status", "상태"],
  ["facility_code", "시설 종류"],
  ["building_id", "건물"],
  ["college_id", "단과대학"],
  ["facility_id", "시설"],
  ["campus", "캠퍼스"],
  ["floor_info", "층 정보"],
  ["description", "설명"],
  ["content", "내용"],
  ["feedback_type", "제보 종류"],
  ["caption", "사진 설명"],
  ["video_caption", "동영상 설명"],
  ["lat", "위도"],
  ["lng", "경도"],
  ["geojson", "건물 형상"],
  ["segments", "경로 형상"],
  ["icon", "아이콘"],
  ["color", "색"],
  ["photo_url", "사진"],
  ["image_url", "이미지"],
  ["url", "사진 주소"],
  ["storage_path", "저장 위치"],
  ["sort_order", "순서"],
  ["video_url", "동영상"],
  ["video_poster_url", "동영상 포스터"],
  ["translation_status", "번역 상태"],
  ["name_en", "이름(영어)"],
  ["name_zh", "이름(중국어)"],
  ["label_en", "이름(영어)"],
  ["label_zh", "이름(중국어)"],
  ["description_en", "설명(영어)"],
  ["description_zh", "설명(중국어)"],
  ["floor_info_en", "층 정보(영어)"],
  ["floor_info_zh", "층 정보(중국어)"],
  ["caption_en", "사진 설명(영어)"],
  ["caption_zh", "사진 설명(중국어)"],
  ["video_caption_en", "동영상 설명(영어)"],
  ["video_caption_zh", "동영상 설명(중국어)"],
  ["value", "값"],
  ["key", "설정"],
  ["code", "코드"],
  ["gpx_file", "GPX 파일"],
  ["page_url", "페이지 주소"],
  ["reviewed_at", "검토 시각"],
  ["deleted_at", "삭제 시각"],
  ["user_id", "계정"],
  ["id", "ID"],
]);
const COLUMN_ORDER = [...COLUMN_LABELS.keys()];

const BOOLEAN_LABELS = new Map<string, readonly [string, string]>([
  ["is_installed", ["설치됨", "미설치"]],
  ["is_deleted", ["삭제됨", "공개"]],
]);

const SETTING_LABELS = new Map<string, string>([
  ["feedback_emails", "제보 알림 메일"],
  ["slope_bands", "경사도 범례"],
]);

const EMPTY = "(비어 있음)";
const SUMMARY_VALUE_LIMIT = 40;

export function isAuditTable(value: unknown): value is AuditTable {
  return (
    typeof value === "string" &&
    (AUDIT_TABLES as readonly string[]).includes(value)
  );
}

function isNamedAction(value: string): value is NamedActionKey {
  return Object.prototype.hasOwnProperty.call(FAILURE_ACTION_LABELS, value);
}

function splitTableAction(key: string): [AuditTable, ChangeOperation] | null {
  const [table, operation, ...rest] = key.split(".");
  if (rest.length > 0 || !isAuditTable(table)) return null;
  return operation === "insert" ||
    operation === "update" ||
    operation === "delete"
    ? [table, operation]
    : null;
}

export function isActionKey(value: unknown): value is ActionKey {
  return (
    typeof value === "string" &&
    (isNamedAction(value) || splitTableAction(value) !== null)
  );
}

export function actionLabel(key: string): string {
  if (isNamedAction(key)) return FAILURE_ACTION_LABELS[key];
  const split = splitTableAction(key);
  return split
    ? `${TABLE_LABELS[split[0]]} ${OPERATION_LABELS[split[1]]}`
    : key;
}

export function tableLabel(table: string | null): string | null {
  if (table === null) return null;
  return isAuditTable(table) ? TABLE_LABELS[table] : table;
}

export function columnLabel(column: string): string {
  return COLUMN_LABELS.get(column) ?? column;
}

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isShapeSummary(
  value: Json | undefined,
): value is { changed: true; points: number } {
  return (
    isObject(value) &&
    value.changed === true &&
    typeof value.points === "number"
  );
}

function isRedacted(
  value: Json | undefined,
): value is { redacted: true; length: number } {
  return (
    isObject(value) &&
    value.redacted === true &&
    typeof value.length === "number"
  );
}

function isReference(
  value: Json | undefined,
): value is { value: Json; label: Json } {
  return (
    isObject(value) &&
    "value" in value &&
    "label" in value &&
    Object.keys(value).length === 2
  );
}

export function formatValue(column: string, value: Json | undefined): string {
  if (value === undefined || value === null || value === "") return EMPTY;
  if (isRedacted(value))
    return `(방문자 입력 ${value.length}자, 기록하지 않음)`;
  if (isShapeSummary(value)) return `형상 변경됨 (꼭짓점 ${value.points}개)`;
  if (isReference(value)) {
    return typeof value.label === "string" && value.label !== ""
      ? value.label
      : formatValue(column, value.value);
  }
  if (typeof value === "boolean") {
    const labels = BOOLEAN_LABELS.get(column);
    if (labels) return value ? labels[0] : labels[1];
    return value ? "예" : "아니오";
  }
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return JSON.stringify(value);
}

type ChangeSource = Pick<ActivityLogRow, "action" | "target_table" | "changes">;

export function changeVerb(row: ChangeSource): string {
  if (row.action === "insert") return OPERATION_LABELS.insert;
  if (row.action === "delete") return OPERATION_LABELS.delete;
  if (row.target_table === "buildings" && isObject(row.changes ?? undefined)) {
    const pair = (row.changes as JsonObject).is_deleted;
    if (Array.isArray(pair)) {
      if (pair[1] === true && pair[0] !== true) return "삭제";
      if (pair[0] === true && pair[1] !== true) return "복구";
    }
  }
  return OPERATION_LABELS.update;
}

export type ChangeLine =
  | {
      kind: "diff";
      column: string;
      label: string;
      before: string;
      after: string;
    }
  | { kind: "value"; column: string; label: string; value: string };

function columnRank(column: string): number {
  const index = COLUMN_ORDER.indexOf(column);
  return index === -1 ? COLUMN_ORDER.length : index;
}

export function changeLines(row: ChangeSource): ChangeLine[] {
  const changes = row.changes ?? undefined;
  if (!isObject(changes)) return [];
  return Object.keys(changes)
    .sort((a, b) => columnRank(a) - columnRank(b) || a.localeCompare(b))
    .map((column): ChangeLine => {
      const label = columnLabel(column);
      const entry = changes[column];
      if (
        row.action === "update" &&
        Array.isArray(entry) &&
        entry.length === 2
      ) {
        return {
          kind: "diff",
          column,
          label,
          before: formatValue(column, entry[0]),
          after: formatValue(column, entry[1]),
        };
      }
      return {
        kind: "value",
        column,
        label,
        value: formatValue(column, entry),
      };
    });
}

function clip(text: string, limit = SUMMARY_VALUE_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** 목록의 `내용` 칸. 실패는 저장된 문장을, 변경은 `<동작>: <첫 칸> 외 N칸`을 보인다. */
export function summarize(
  row: Pick<
    ActivityLogRow,
    "kind" | "action" | "target_table" | "changes" | "message"
  >,
): string {
  if (row.kind === "failure")
    return row.message ?? `${actionLabel(row.action)} 실패`;
  const verb = changeVerb(row);
  if (verb === "삭제" || verb === "복구") return verb;
  const lines = changeLines(row);
  if (lines.length === 0) return verb;
  const first = lines[0];
  const text =
    first.kind === "diff"
      ? `${first.label} ${clip(first.before)} → ${clip(first.after)}`
      : `${first.label} ${clip(first.value)}`;
  return lines.length > 1
    ? `${verb}: ${text} 외 ${lines.length - 1}칸`
    : `${verb}: ${text}`;
}

export function targetText(
  row: Pick<ActivityLogRow, "target_table" | "target_label">,
): string {
  const kind = tableLabel(row.target_table);
  const name =
    row.target_table === "app_settings" && row.target_label
      ? (SETTING_LABELS.get(row.target_label) ?? row.target_label)
      : row.target_label;
  const parts = [kind, name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}

const SEOUL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoulParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    SEOUL_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** 올해면 `MM/DD HH:mm`, 아니면 `YYYY/MM/DD HH:mm`. 관리자가 한국에 있어 서울 시각으로 고정한다. */
export function formatLogTime(iso: string, now: Date = new Date()): string {
  const at = seoulParts(new Date(iso));
  const time = `${at.month}/${at.day} ${at.hour}:${at.minute}`;
  return at.year === seoulParts(now).year ? time : `${at.year}/${time}`;
}

export function recordedLate(
  row: Pick<ActivityLogRow, "occurred_at" | "recorded_at">,
): boolean {
  return (
    Math.abs(Date.parse(row.recorded_at) - Date.parse(row.occurred_at)) > 60_000
  );
}
