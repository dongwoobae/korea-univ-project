export interface AdminBuildingSummary {
  registered_facility_count: number;
  missing_facility_count: number;
  missing_photo_count: number;
  missing_location_count: number;
  stale_update_count: number;
  /** 번역이 필요한 **시설** 수 */
  translation_needed_count: number;
  /** 번역이 필요한 시설을 가진 **건물** 수 (클릭 필터가 거르는 대상) */
  translation_needed_building_count: number;
}

export type AdminBuildingFlagKey =
  | "missing_facility"
  | "missing_photo"
  | "missing_location"
  | "stale_update"
  | "translation_needed";

export const ADMIN_BUILDING_FLAG_LABELS: Record<AdminBuildingFlagKey, string> =
  {
    missing_facility: "시설 정보 없음",
    missing_photo: "사진 없음",
    missing_location: "위치 없음",
    stale_update: "갱신일 오래됨",
    translation_needed: "번역 필요",
  };

export interface AdminSummaryPart {
  prefix?: string;
  value: number;
}

export interface AdminSummaryItem {
  id: string;
  label: string;
  description: string;
  /** 카드에 표시할 값. 카드마다 표시 방식이 다를 수 있다. */
  parts: (summary: AdminBuildingSummary) => AdminSummaryPart[];
  /** 0보다 크면 경고 강조 */
  warningValue: (summary: AdminBuildingSummary) => number;
  /** 있으면 클릭 가능한 필터 카드. 표시 값과는 별개의 키다. */
  flag?: AdminBuildingFlagKey;
}

export const ADMIN_SUMMARY_ITEMS: AdminSummaryItem[] = [
  {
    id: "registered_facility",
    label: "등록된 시설",
    description: "공개 건물에 등록된 시설",
    parts: (summary) => [{ value: summary.registered_facility_count }],
    warningValue: () => 0,
  },
  {
    id: "missing_facility",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_facility,
    description: "등록된 시설이 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_facility_count }],
    warningValue: (summary) => summary.missing_facility_count,
    flag: "missing_facility",
  },
  {
    id: "missing_photo",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_photo,
    description: "사진이 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_photo_count }],
    warningValue: (summary) => summary.missing_photo_count,
    flag: "missing_photo",
  },
  {
    id: "missing_location",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_location,
    description: "지도 위치가 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_location_count }],
    warningValue: (summary) => summary.missing_location_count,
    flag: "missing_location",
  },
  {
    id: "stale_update",
    label: ADMIN_BUILDING_FLAG_LABELS.stale_update,
    description: "갱신일이 없거나 1년 이상 지난 공개 건물",
    parts: (summary) => [{ value: summary.stale_update_count }],
    warningValue: (summary) => summary.stale_update_count,
    flag: "stale_update",
  },
  {
    // 이 카드만 두 숫자를 갖는다. 카드가 세는 것은 시설이지만 클릭 필터는
    // 건물을 거르므로, 걸러지는 대상이 카드에서 바로 읽혀야 한다.
    id: "translation_needed",
    label: ADMIN_BUILDING_FLAG_LABELS.translation_needed,
    description: "번역 대기 또는 실패 상태인 시설 · 그 시설을 가진 건물",
    parts: (summary) => [
      { prefix: "시설", value: summary.translation_needed_count },
      { prefix: "건물", value: summary.translation_needed_building_count },
    ],
    warningValue: (summary) => summary.translation_needed_count,
    flag: "translation_needed",
  },
];

interface CountResult {
  count: number | null;
  error: unknown;
}

interface SummaryResult {
  data: AdminBuildingSummary | null;
  error: unknown;
}

export type ResolvedSummary =
  | {
      status: "ok";
      value: {
        overallTotalCount: number;
        deletedCount: number;
        summary: AdminBuildingSummary;
      };
    }
  | { status: "error"; errors: unknown[] };

/**
 * 세 요청 중 하나라도 실패하면 요약 영역 전체를 실패로 본다.
 * 부분 성공을 부분 표시하면 어느 숫자가 진짜인지 화면에서 구분할 수 없다.
 */
export function resolveSummary(
  totalResult: CountResult,
  deletedResult: CountResult,
  summaryResult: SummaryResult,
): ResolvedSummary {
  const errors = [
    totalResult.error,
    deletedResult.error,
    summaryResult.error,
  ].filter(Boolean);
  if (errors.length > 0 || !summaryResult.data) {
    return { status: "error", errors };
  }
  return {
    status: "ok",
    value: {
      overallTotalCount: totalResult.count ?? 0,
      deletedCount: deletedResult.count ?? 0,
      summary: summaryResult.data,
    },
  };
}

export type ResolvedFlagFilter =
  { status: "error" } | { status: "empty" } | { status: "ids"; ids: number[] };

/**
 * 플래그 조회 결과를 세 갈래로 나눈다.
 *
 * 0건에서 빈 배열을 그대로 `.in()`에 넘기면 supabase-js가 `id=in.()`으로
 * 직렬화하고 PostgREST가 파싱 오류를 돌려준다 — "경고 0건인 카드를 눌렀더니
 * 목록이 깨진다"가 된다. 오류를 빈 배열로 뭉개면 뷰 미적용·RLS 거부·네트워크
 * 실패가 모두 "해당 건물 없음"으로 보인다.
 */
export function resolveFlagFilter(response: {
  data: { building_id: number | null }[] | null;
  error: unknown;
}): ResolvedFlagFilter {
  if (response.error) return { status: "error" };
  const ids = (response.data ?? [])
    .map((row) => row.building_id)
    .filter((id): id is number => id !== null);
  if (ids.length === 0) return { status: "empty" };
  return { status: "ids", ids };
}
