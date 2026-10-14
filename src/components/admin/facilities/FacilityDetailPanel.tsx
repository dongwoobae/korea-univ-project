"use client";

import { useEffect, useId, useRef, useState } from "react";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import FacilityPhotoManager from "@/components/admin/FacilityPhotoManager";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel from "@/components/admin/workspace/DetailPanel";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  type DetailDraftPin,
  type LatLngTuple,
} from "@/components/admin/workspace/types";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { authedFetch } from "@/lib/authedFetch";
import {
  inferCampusFromPoint,
  type CampusBoundaryCollection,
} from "@/lib/campusGeometry";
import { deleteFacility } from "@/lib/facilityDelete";
import { validateFacilityForm } from "@/lib/facilityForm";
import { buildFacilityPayload, saveFacility } from "@/lib/facilitySave";
import { translateFacility } from "@/lib/facilityTranslation";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import {
  facilityDisplayName,
  facilityFormDirty,
  facilityFormFromRow,
} from "@/lib/facilityWorkspace";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType, FacilityWithType } from "@/types/domain";

interface FacilityDetailPanelProps {
  /** null이면 새로 만들기 */
  facility: FacilityWithType | null;
  facilityTypes: FacilityType[];
  boundaries: CampusBoundaryCollection | null;
  boundariesError: boolean;
  onDraftChange: (draft: DetailDraftPin) => void;
  /** `현 위치로 찍기`가 찍은 점. 패널이 사라질 때 null로 거둔다 */
  onLocated: (position: LatLngTuple | null) => void;
  /** 다시 받기가 끝난 뒤 돌아온다 */
  onSaved: (facilityId: string, created: boolean) => Promise<void>;
  onChanged: () => Promise<void>;
  onDeleted: (facilityId: string) => Promise<void>;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityDetailPanel({
  facility,
  facilityTypes,
  boundaries,
  boundariesError,
  onDraftChange,
  onLocated,
  onSaved,
  onChanged,
  onDeleted,
  onClose,
  showToast,
}: FacilityDetailPanelProps) {
  const owner = facility?.id ?? "new";
  const [form, setForm] = useState(() => facilityFormFromRow(facility));
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [locating, setLocating] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const locateRequestRef = useRef(0);
  const onDraftChangeRef = useRef(onDraftChange);
  const onLocatedRef = useRef(onLocated);
  const fieldId = useId();
  const busy = saving || installing;
  useUnsavedChanges(facilityFormDirty(form, facility));

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onLocatedRef.current = onLocated;
  }, [onDraftChange, onLocated]);

  // 지도(형제 컴포넌트)가 초안 핀을 그리고 옮기도록 맡긴다
  useEffect(() => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    onDraftChangeRef.current({
      owner,
      position:
        Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null,
      setPosition: ([nextLat, nextLng]) =>
        setForm((previous) => ({
          ...previous,
          lat: nextLat.toFixed(7),
          lng: nextLng.toFixed(7),
        })),
      saving,
    });
  }, [owner, form.lat, form.lng, saving]);

  // 패널이 바뀐 뒤 도착한 현재 위치는 버린다(설계 2026-10-14 3.5). 다시 연 같은 항목에 지난 이동이 남지 않게 거둔다
  useEffect(
    () => () => {
      locateRequestRef.current += 1;
      onLocatedRef.current(null);
    },
    [],
  );

  const lat = parseFloat(form.lat);
  const lng = parseFloat(form.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const campus = hasPosition
    ? inferCampusFromPoint([lng, lat], boundaries)
    : null;
  const campusText = !hasPosition
    ? "지도를 눌러 위치를 찍어 주세요"
    : !boundaries && !boundariesError
      ? "캠퍼스 영역 확인 중..."
      : campus
        ? `${campus} 영역 · 지도에서 핀 이동`
        : boundariesError
          ? "캠퍼스 영역을 확인하지 못했습니다. 저장은 가능합니다."
          : "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다.";
  const installed = facility ? facility.is_installed : form.is_installed;
  const code =
    facility?.facility_types?.code ??
    facility?.facility_code ??
    form.facility_code;

  function locate() {
    if (!navigator.geolocation) {
      showToast("현재 위치를 사용할 수 없는 브라우저입니다.", "error");
      return;
    }
    locateRequestRef.current += 1;
    const request = locateRequestRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== locateRequestRef.current) return;
        const nextLat = coords.latitude.toFixed(7);
        const nextLng = coords.longitude.toFixed(7);
        setLocating(false);
        setForm((previous) => ({ ...previous, lat: nextLat, lng: nextLng }));
        onLocatedRef.current([parseFloat(nextLat), parseFloat(nextLng)]);
        showToast("현재 위치를 지도에 표시했어요.");
      },
      () => {
        if (request !== locateRequestRef.current) return;
        setLocating(false);
        showToast("위치 권한을 확인해 주세요.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveInstalled(target: FacilityWithType, next: boolean) {
    if (target.is_installed === next) return;
    setInstalling(true);
    const { error } = await supabase
      .from("building_facilities")
      .update({ is_installed: next })
      .eq("id", target.id);
    if (error) {
      setInstalling(false);
      showToast("설치 상태 변경에 실패했어요", "error");
      return;
    }
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    await onChanged();
    setInstalling(false);
    showToast(next ? "설치로 변경되었어요" : "미설치로 변경되었어요");
  }

  function chooseInstalled(next: boolean) {
    if (facility) {
      void saveInstalled(facility, next);
      return;
    }
    setForm((previous) => ({ ...previous, is_installed: next }));
  }

  async function retranslate(facilityId: string) {
    setRetranslating(true);
    const translated = await translateFacility(facilityId);
    if (translated) {
      await onChanged();
      showToast("시설 번역을 완료했어요");
    } else {
      showToast("자동 번역에 다시 실패했어요", "warning");
    }
    setRetranslating(false);
  }

  async function remove() {
    if (!facility) return;
    // deleteFacility는 네트워크 오류면 메시지를 돌려주지 않고 던진다
    const error = await deleteFacility(facility).catch(
      () => "시설 삭제에 실패했어요",
    );
    if (error) {
      showToast(error, "error");
      return;
    }
    await onDeleted(facility.id);
    showToast("시설이 삭제되었어요");
  }

  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone: true });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    // 저장 요청에 실린 좌표와 화면의 핀이 갈라지지 않게 늦은 현재 위치를 버린다(설계 2026-10-14 3.5)
    locateRequestRef.current += 1;
    setLocating(false);
    setSaving(true);
    const created = facility === null;
    const result = await saveFacility(
      facility?.id ?? null,
      buildFacilityPayload(form, {
        buildingId: null,
        includeInstalled: created,
      }),
    );
    if (result.status === "failed") {
      setSaving(false);
      showToast("저장에 실패했어요", "error");
      return;
    }
    await onSaved(result.facilityId, created);
    setSaving(false);
    if (!result.translated) {
      showToast(
        "시설은 저장했지만 자동 번역에 실패했어요. 상세에서 재번역해 주세요.",
        "warning",
      );
      return;
    }
    showToast(created ? "시설이 추가되었어요!" : "시설이 수정되었어요!");
  }

  return (
    <DetailPanel
      label={facility ? facilityDisplayName(facility) : "시설 추가"}
      header={
        <div className="ku-detail-title">
          <span
            className="ku-detail-title-icon"
            style={{ background: getFacilityMarkerColor(code ?? "") }}
            aria-hidden="true"
          >
            <FacilityTypeIcon code={code} size={20} />
          </span>
          <div>
            <h2>{facility ? facilityDisplayName(facility) : "시설 추가"}</h2>
            <p>
              {facility
                ? `${facility.facility_types?.label ?? "유형 없음"} · ${formatAdminUpdatedAt(facility.updated_at)}`
                : "지도를 눌러 위치를 찍어요"}
            </p>
          </div>
        </div>
      }
      onClose={onClose}
      closeDisabled={saving}
      remove={
        facility
          ? {
              confirmMessage: "삭제한 시설은 복구할 수 없어요.",
              disabled: busy,
              onConfirm: remove,
            }
          : undefined
      }
      save={{
        pending: saving,
        disabled: installing,
        onClick: () => void handleSave(),
      }}
    >
      <div className="ku-detail-status-row">
        <div className="ku-detail-segment" role="group" aria-label="설치 상태">
          <button
            type="button"
            data-tone="installed"
            aria-pressed={installed === true}
            disabled={busy}
            onClick={() => chooseInstalled(true)}
          >
            설치
          </button>
          <button
            type="button"
            data-tone="missing"
            aria-pressed={installed === false}
            disabled={busy}
            onClick={() => chooseInstalled(false)}
          >
            미설치
          </button>
        </div>
        {facility &&
          (facilityNeedsTranslation(facility) ? (
            <span className="ku-detail-translation-pill">
              {facility.translation_status === "pending"
                ? "영문·중문 번역 대기"
                : "영문·중문 번역 필요"}
              <button
                type="button"
                onClick={() => void retranslate(facility.id)}
                disabled={retranslating || saving}
              >
                {retranslating ? "번역 중..." : "재번역"}
              </button>
            </span>
          ) : (
            <span className="ku-detail-translation-done">
              ✓ 영문·중문 번역 완료
            </span>
          ))}
      </div>

      <div className="ku-detail-form">
        <FacilityFields
          idPrefix={fieldId}
          value={form}
          onChange={setForm}
          facilityTypes={facilityTypes.map((type) => ({
            code: type.code,
            label: type.label ?? type.code,
          }))}
          labels={ADMIN_FACILITY_FIELD_LABELS}
          mapCenter={DEFAULT_WORKSPACE_VIEWPORT.center}
          showFloor={false}
          showInstalled={false}
          showLocation={false}
          disabled={saving}
        />
      </div>

      <div className="ku-detail-location">
        <span className="ku-detail-label">위치 *</span>
        {hasPosition && (
          <span className="ku-detail-coords">
            {form.lat}, {form.lng}
          </span>
        )}
        <span
          className="ku-detail-campus"
          data-tone={campus ? "ok" : "warn"}
          aria-live="polite"
        >
          {campusText}
        </span>
        <button
          type="button"
          className="ku-workspace-button"
          onClick={locate}
          disabled={saving || locating}
        >
          <span aria-hidden="true">📍</span>{" "}
          {locating ? "위치 찾는 중..." : "현 위치로 찍기"}
        </button>
      </div>

      <div className="ku-detail-media">
        <div>
          <span className="ku-detail-label">
            사진 {facility?.facility_photos?.length ?? 0}장
          </span>
          {facility ? (
            <FacilityPhotoManager
              facilityId={facility.id}
              photos={facility.facility_photos ?? []}
              onChanged={onChanged}
              showToast={showToast}
            />
          ) : (
            <button type="button" className="ku-detail-dashed" disabled>
              ＋ 사진 추가
            </button>
          )}
        </div>
        <div>
          <span className="ku-detail-label">동영상</span>
          {facility?.video_url ? (
            <div className="ku-detail-video">
              <span className="ku-detail-video-thumb" aria-hidden="true">
                ▶
              </span>
              <span>연결됨</span>
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                disabled={saving}
              >
                교체
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ku-detail-dashed"
              onClick={() => setVideoOpen(true)}
              disabled={!facility || saving}
            >
              ＋ 동영상 연결
            </button>
          )}
        </div>
      </div>
      {!facility && (
        <p className="ku-detail-hint">
          사진과 동영상은 저장한 뒤에 올릴 수 있어요
        </p>
      )}
      {videoOpen && facility && (
        <FacilityVideoModal
          facility={facility}
          onUpdate={onChanged}
          showToast={showToast}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </DetailPanel>
  );
}
