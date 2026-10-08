export type InboxFilter = "open" | "new" | "reviewing" | "done" | "all";
export type RequestStatus = "new" | "reviewing" | "approved" | "rejected";
export type FeedbackStatus = "new" | "reviewing" | "resolved";

export const INBOX_FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "open", label: "처리 전(신규·확인 중)" },
  { value: "new", label: "신규" },
  { value: "reviewing", label: "확인 중" },
  { value: "done", label: "처리 완료" },
  { value: "all", label: "전체" },
];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "신규",
  reviewing: "확인 중",
  approved: "승인됨",
  rejected: "거절됨",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "신규",
  reviewing: "확인 중",
  resolved: "처리 완료",
};

export function parseInboxFilter(value: string | null): InboxFilter {
  return INBOX_FILTERS.some((filter) => filter.value === value)
    ? (value as InboxFilter)
    : "open";
}

export function requestStatusesFor(
  filter: InboxFilter,
): RequestStatus[] | null {
  if (filter === "all") return null;
  if (filter === "open") return ["new", "reviewing"];
  if (filter === "done") return ["approved", "rejected"];
  return [filter];
}

export function feedbackStatusesFor(
  filter: InboxFilter,
): FeedbackStatus[] | null {
  if (filter === "all") return null;
  if (filter === "open") return ["new", "reviewing"];
  if (filter === "done") return ["resolved"];
  return [filter];
}

export function isEndStatus(status: string): boolean {
  return status === "approved" || status === "rejected";
}

export interface FacilityRequestListItem {
  id: string;
  building_id: number;
  building_name: string | null;
  facility_code: string;
  name: string | null;
  floor_info: string | null;
  has_location: boolean;
  status: RequestStatus;
  created_at: string;
  facility_id: string | null;
  photo_count: number;
  thumbnail_url: string | null;
}

export interface FacilityRequestDetail {
  id: string;
  building_id: number;
  facility_code: string;
  name: string | null;
  description: string | null;
  floor_info: string | null;
  lat: number | null;
  lng: number | null;
  status: RequestStatus;
  created_at: string;
  reviewed_at: string | null;
  facility_id: string | null;
  building: { id: number; name: string | null; geojson: unknown } | null;
  photos: { id: string; sort_order: number; url: string | null }[];
}

export interface FeedbackItem {
  id: string;
  feedback_type: string;
  content: string;
  page_url: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return value === "new" || value === "reviewing" || value === "resolved";
}
