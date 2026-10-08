"use client";

import { useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { validateFacilityForm } from "@/lib/facilityForm";
import { inferCampusFromPoint } from "@/lib/campusGeometry";
import { translateFacility } from "@/lib/facilityTranslation";
import { useCampusBoundaries } from "@/lib/useCampusBoundaries";
import { useModalFocus } from "@/lib/useModalFocus";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import type { FacilityFieldValues } from "@/lib/facilityFields";
import type { FacilityType, FacilityWithType } from "@/types/domain";

interface FacilityFormModalProps {
  /** null이면 건물 비종속(독립) 시설 */
  buildingId: number | null;
  center: [number, number];
  facilityTypes: FacilityType[];
  /** null이면 신규 추가, 값이 있으면 해당 시설 편집 */
  facility: FacilityWithType | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityFormModal({
  buildingId,
  center,
  facilityTypes,
  facility,
  onClose,
  onSaved,
  showToast,
}: FacilityFormModalProps) {
  const standalone = buildingId === null;
  const editing = facility !== null;
  const [form, setForm] = useState<FacilityFieldValues>({
    facility_code: facility?.facility_code ?? "",
    name: facility?.name ?? "",
    description: facility?.description ?? "",
    floor_info: facility?.floor_info ?? "",
    is_installed: facility?.is_installed ?? true,
    lat: facility?.lat != null ? String(facility.lat) : "",
    lng: facility?.lng != null ? String(facility.lng) : "",
  });
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    closeOnEscape: !saving,
  });
  const { boundaries, error: boundariesError } = useCampusBoundaries();
  const positionCampus = useMemo(() => {
    if (!form.lat || !form.lng) return null;
    return inferCampusFromPoint(
      [parseFloat(form.lng), parseFloat(form.lat)],
      boundaries,
    );
  }, [form.lat, form.lng, boundaries]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      showToast("현재 위치를 사용할 수 없는 브라우저입니다.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((previous) => ({
          ...previous,
          lat: coords.latitude.toFixed(7),
          lng: coords.longitude.toFixed(7),
        }));
        showToast("현재 위치를 지도에 표시했어요.");
      },
      () => showToast("위치 권한을 확인해 주세요.", "error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    setSaving(true);

    const payload = {
      building_id: buildingId,
      facility_code: form.facility_code,
      name: form.name || null,
      description: form.description || null,
      floor_info: standalone ? null : form.floor_info || null,
      is_installed: form.is_installed,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      translation_status: "pending",
    };

    // 주의: `editing` 불리언으로는 facility가 non-null로 좁혀지지 않는다.
    // 반드시 facility 자체를 조건으로 써야 typecheck를 통과한다.
    let facilityId: string;
    if (facility) {
      const { error } = await supabase
        .from("building_facilities")
        .update(payload)
        .eq("id", facility.id);
      if (error) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = facility.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("building_facilities")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = inserted.id;
    }

    const translated = await translateFacility({
      id: facilityId,
      name: payload.name,
      description: payload.description,
      floor_info: payload.floor_info,
    });
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );

    setSaving(false);
    onSaved();
    if (!translated) {
      showToast(
        "시설은 저장했지만 자동 번역에 실패했어요. 목록에서 재번역해 주세요.",
        "warning",
      );
      return;
    }
    showToast(editing ? "시설이 수정되었어요!" : "시설이 추가되었어요!");
  }

  return (
    <div
      ref={dialogRef}
      className="ku-facility-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="ku-facility-modal"
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "min(500px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          id={titleId}
          style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}
        >
          {editing ? "시설 수정" : "시설 추가"}
        </div>

        <FacilityFields
          idPrefix={fieldId}
          value={form}
          onChange={setForm}
          facilityTypes={facilityTypes.map((type) => ({
            code: type.code,
            label: type.label ?? type.code,
          }))}
          labels={ADMIN_FACILITY_FIELD_LABELS}
          mapCenter={center}
          highlightBuildingId={buildingId ?? undefined}
          showFloor={!standalone}
          showInstalled
          locationRequired={standalone}
          locationFooter={
            <>
              <button
                className="ku-current-location-button"
                type="button"
                onClick={useCurrentLocation}
              >
                <span aria-hidden="true">📍</span> 현 위치로 찍기
              </button>
              {form.lat && form.lng && (
                <div aria-live="polite" style={{ fontSize: 12, marginTop: 8 }}>
                  <div style={{ color: "#2563EB" }}>
                    선택된 위치: {form.lat}, {form.lng}
                  </div>
                  <div
                    style={{
                      color: positionCampus ? "#166534" : "#B45309",
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    {!boundaries && !boundariesError
                      ? "캠퍼스 영역 확인 중..."
                      : positionCampus
                        ? `${positionCampus} 영역입니다.`
                        : boundariesError
                          ? "캠퍼스 영역을 확인하지 못했습니다. 저장은 가능합니다."
                          : "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다."}
                  </div>
                </div>
              )}
            </>
          }
        />

        <div className="ku-facility-modal-actions">
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px",
              background: "#8C0000",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
