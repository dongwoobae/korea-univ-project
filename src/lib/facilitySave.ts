import type { Database } from "@supabase-types";
import { authedFetch } from "@/lib/authedFetch";
import type { FacilityFieldValues } from "@/lib/facilityFields";
import { translateFacility } from "@/lib/facilityTranslation";
import { supabase } from "@/lib/supabaseClient";

type FacilityInsert =
  Database["public"]["Tables"]["building_facilities"]["Insert"];

export type FacilityWritePayload = Pick<
  FacilityInsert,
  | "building_id"
  | "facility_code"
  | "name"
  | "description"
  | "floor_info"
  | "is_installed"
  | "lat"
  | "lng"
  | "translation_status"
>;

export function buildFacilityPayload(
  form: FacilityFieldValues,
  options: { buildingId: number | null; includeInstalled: boolean },
): FacilityWritePayload {
  return {
    building_id: options.buildingId,
    facility_code: form.facility_code,
    name: form.name || null,
    description: form.description || null,
    floor_info: options.buildingId === null ? null : form.floor_info || null,
    // 독립 시설 패널은 설치 상태를 세그먼트가 바로 저장한다. 폼 저장이 처음 읽은 값으로 되돌리지 않게 뺀다(설계 2026-10-14 4.2)
    ...(options.includeInstalled ? { is_installed: form.is_installed } : {}),
    lat: form.lat ? parseFloat(form.lat) : null,
    lng: form.lng ? parseFloat(form.lng) : null,
    translation_status: "pending",
  };
}

export type FacilitySaveResult =
  | { status: "failed" }
  | {
      status: "saved";
      facilityId: string;
      translated: boolean;
      revalidated: boolean;
    };

/**
 * 시설 직접 저장(건물 상세 모달·독립 시설 패널)의 한 경로. 등록 요청 승인은 자기 API가 한다.
 * 토스트 문구와 닫기는 화면이 이 결과로 정한다(설계 2026-10-14 4.2).
 */
export async function saveFacility(
  facilityId: string | null,
  payload: FacilityWritePayload,
): Promise<FacilitySaveResult> {
  let savedId: string;
  if (facilityId) {
    const { error } = await supabase
      .from("building_facilities")
      .update(payload)
      .eq("id", facilityId);
    if (error) return { status: "failed" };
    savedId = facilityId;
  } else {
    const { data, error } = await supabase
      .from("building_facilities")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) return { status: "failed" };
    savedId = data.id;
  }

  const translated = await translateFacility(savedId);
  const revalidated = await authedFetch("/api/revalidate-facilities", {
    method: "POST",
  }).then(
    (response) => response.ok,
    () => false,
  );
  return { status: "saved", facilityId: savedId, translated, revalidated };
}
