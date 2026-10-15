import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "./facilityFields";
import { isEndStatus, type FacilityRequestDetail } from "./inboxStatus";

export function fieldsFromRequest(
  detail: FacilityRequestDetail,
): FacilityFieldValues {
  return {
    ...EMPTY_FACILITY_FIELDS,
    facility_code: detail.facility_code,
    name: detail.name ?? "",
    description: detail.description ?? "",
    floor_info: detail.floor_info ?? "",
    lat: detail.lat != null ? String(detail.lat) : "",
    lng: detail.lng != null ? String(detail.lng) : "",
  };
}

/** 서명 주소가 없는 사진은 관리자가 보지 못했으므로 공개 대상에서 뺀다. */
export function initialPhotoSelection(
  detail: FacilityRequestDetail,
): Set<string> {
  return new Set(
    detail.photos.filter((photo) => photo.url).map((photo) => photo.id),
  );
}

/** 끝 상태 요청은 고칠 수 없으므로 항상 false다. */
export function isReviewDraftDirty(
  detail: FacilityRequestDetail,
  fields: FacilityFieldValues,
  selection: ReadonlySet<string>,
): boolean {
  if (isEndStatus(detail.status)) return false;
  const baseline = fieldsFromRequest(detail);
  const fieldsChanged = (
    Object.keys(baseline) as (keyof FacilityFieldValues)[]
  ).some((key) => fields[key] !== baseline[key]);
  if (fieldsChanged) return true;
  const baseSelection = initialPhotoSelection(detail);
  return (
    selection.size !== baseSelection.size ||
    [...selection].some((id) => !baseSelection.has(id))
  );
}

export type RequestLocationNote = "reporter" | "picked" | "none";

export function requestLocationNote(
  detail: FacilityRequestDetail,
  fields: FacilityFieldValues,
): RequestLocationNote {
  if (fields.lat === "" || fields.lng === "") return "none";
  const sameAsRequest =
    detail.lat != null &&
    detail.lng != null &&
    fields.lat === String(detail.lat) &&
    fields.lng === String(detail.lng);
  return sameAsRequest ? "reporter" : "picked";
}
