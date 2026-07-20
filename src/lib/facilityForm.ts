export interface FacilityFormValues {
  facility_code: string;
  lat: string;
  lng: string;
}

/** 시설 폼 저장 전 검증. 통과하면 null, 실패하면 토스트용 메시지. */
export function validateFacilityForm(
  form: FacilityFormValues,
  opts: { standalone: boolean },
): string | null {
  if (!form.facility_code) return "시설 유형을 선택해주세요";
  if (opts.standalone && (!form.lat || !form.lng))
    return "지도를 클릭해 위치를 선택해주세요";
  return null;
}
