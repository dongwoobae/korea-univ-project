"use client";

import { useEffect, useId, useState } from "react";
import type { Feature, Polygon } from "geojson";
import ConfirmModal from "@/components/ConfirmModal";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import { authedFetch } from "@/lib/authedFetch";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import { translateFacility } from "@/lib/facilityTranslation";
import {
  REQUEST_STATUS_LABELS,
  isEndStatus,
  type FacilityRequestDetail,
} from "@/lib/inboxStatus";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
import { useModalFocus } from "@/lib/useModalFocus";

interface FacilityRequestReviewModalProps {
  requestId: string;
  facilityTypes: { code: string; label: string }[];
  onClose: () => void;
  onChanged: () => void;
  showToast: (message: string, type?: string) => void;
}

function toFields(detail: FacilityRequestDetail): FacilityFieldValues {
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

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

export default function FacilityRequestReviewModal({
  requestId,
  facilityTypes,
  onClose,
  onChanged,
  showToast,
}: FacilityRequestReviewModalProps) {
  const titleId = useId();
  const fieldId = useId();
  const [detail, setDetail] = useState<FacilityRequestDetail | null>(null);
  const [fields, setFields] = useState<FacilityFieldValues>(
    EMPTY_FACILITY_FIELDS,
  );
  const [publish, setPublish] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  // 다른 관리자가 먼저 처리했으면(409) 상세를 다시 읽어 읽기 전용으로 보인다.
  const [loadKey, setLoadKey] = useState(0);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    closeOnEscape: !busy && !confirmReject,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await authedFetch(
        `/api/facility-requests/${requestId}`,
      ).catch(() => null);
      if (cancelled) return;
      const body =
        response?.ok &&
        ((await response
          .json()
          .catch(() => null)) as FacilityRequestDetail | null);
      if (cancelled) return;
      if (!body) {
        showToast(
          response
            ? await readError(response, "요청을 불러오지 못했어요")
            : "요청을 불러오지 못했어요",
          "error",
        );
        onClose();
        return;
      }
      setDetail(body);
      setFields(toFields(body));
      // 서명 주소가 없는 사진은 관리자가 보지 못했으므로 공개 대상에서 뺀다.
      setPublish(
        new Set(
          body.photos.filter((photo) => photo.url).map((photo) => photo.id),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, loadKey, onClose, showToast]);

  const ended = detail ? isEndStatus(detail.status) : true;

  // 실패 응답이면 안내하고 목록과 상세를 다시 읽는다. 상태가 바뀐 요청을 낡은 화면으로 두지 않는다.
  async function failed(response: Response | null, fallback: string) {
    showToast(
      response ? await readError(response, fallback) : fallback,
      "error",
    );
    onChanged();
    if (response?.status === 409) setLoadKey((key) => key + 1);
  }

  async function changeStatus(status: "new" | "reviewing") {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    ).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      await failed(response, "상태를 바꾸지 못했어요");
      return;
    }
    setDetail((previous) => (previous ? { ...previous, status } : previous));
    onChanged();
  }

  async function approve() {
    if (!fields.facility_code) {
      showToast("시설 유형을 선택해주세요", "warning");
      return;
    }
    setBusy(true);
    const payload = {
      facility_code: fields.facility_code,
      name: fields.name,
      description: fields.description,
      floor_info: fields.floor_info,
      is_installed: fields.is_installed,
      lat: fields.lat ? Number(fields.lat) : null,
      lng: fields.lng ? Number(fields.lng) : null,
    };
    const photoIds = (detail?.photos ?? [])
      .filter((photo) => publish.has(photo.id))
      .map((photo) => photo.id);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload, photoIds }),
      },
    ).catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      await failed(response, "승인하지 못했어요");
      // 응답을 잃었으면 승인됐을 수도 있다. 다시 읽어 실제 상태를 보인다.
      if (!response) setLoadKey((key) => key + 1);
      return;
    }
    const { facilityId, cleanupFailed } = (await response.json()) as {
      facilityId: string;
      cleanupFailed: boolean;
    };
    const translated = await translateFacility({
      id: facilityId,
      name: payload.name || null,
      description: payload.description || null,
      floor_info: payload.floor_info || null,
    });
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    setBusy(false);
    onChanged();
    onClose();
    showToast(
      !translated
        ? "등록했지만 자동 번역에 실패했어요. 건물 화면에서 재번역해 주세요."
        : cleanupFailed
          ? "등록했어요. 요청 사진 정리는 실패해 다시 해야 해요."
          : "등록했어요!",
      !translated || cleanupFailed ? "warning" : "success",
    );
  }

  async function reject() {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/reject`,
      { method: "POST" },
    ).catch(() => null);
    setBusy(false);
    setConfirmReject(false);
    if (!response?.ok) {
      await failed(response, "거절하지 못했어요");
      return;
    }
    const { cleanupFailed } = (await response.json()) as {
      cleanupFailed: boolean;
    };
    onChanged();
    onClose();
    showToast(
      cleanupFailed ? "거절했지만 사진을 지우지 못했어요" : "거절했어요",
      cleanupFailed ? "warning" : "success",
    );
  }

  async function cleanup() {
    setBusy(true);
    const response = await authedFetch(
      `/api/facility-requests/${requestId}/cleanup`,
      { method: "POST" },
    ).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      await failed(response, "사진을 지우지 못했어요");
      return;
    }
    setDetail((previous) =>
      previous ? { ...previous, photos: [] } : previous,
    );
    onChanged();
    showToast("남은 사진을 정리했어요");
  }

  const center: [number, number] =
    detail?.lat != null && detail?.lng != null
      ? [detail.lat, detail.lng]
      : getPolygonRingCenter(
          (detail?.building?.geojson as Feature<Polygon> | null) ?? null,
        );

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
          width: "min(640px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div id={titleId} className="ku-review-modal-title">
          {facilityTypes.find((type) => type.code === detail?.facility_code)
            ?.label ?? "시설"}{" "}
          등록 요청
        </div>
        {detail && (
          <div className="ku-review-modal-meta">
            <span className="ku-inbox-status" data-status={detail.status}>
              {REQUEST_STATUS_LABELS[detail.status]}
            </span>
            <span>{detail.building?.name ?? `건물 ${detail.building_id}`}</span>
            {detail.facility_id && (
              <a href={`/admin/buildings/${detail.building_id}`}>
                만들어진 시설 보기
              </a>
            )}
          </div>
        )}

        {!detail ? (
          <div className="ku-admin-empty">불러오는 중...</div>
        ) : (
          <>
            {detail.photos.length > 0 && (
              <ul className="ku-review-photos" aria-label="요청 사진">
                {detail.photos.map((photo, index) => (
                  <li key={photo.id}>
                    {photo.url ? (
                      // 비공개 버킷의 서명 주소라 next/image 최적화를 거치지 않는다.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt={`요청 사진 ${index + 1}`} />
                    ) : (
                      <span className="ku-review-photo-missing">
                        볼 수 없음
                      </span>
                    )}
                    {!ended && (
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`사진 ${index + 1} 공개`}
                          checked={publish.has(photo.id)}
                          disabled={!photo.url || busy}
                          onChange={(event) =>
                            setPublish((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(photo.id);
                              else next.delete(photo.id);
                              return next;
                            })
                          }
                        />
                        공개
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <FacilityFields
              idPrefix={fieldId}
              value={fields}
              onChange={setFields}
              facilityTypes={facilityTypes}
              labels={ADMIN_FACILITY_FIELD_LABELS}
              mapCenter={center}
              highlightBuildingId={detail.building_id}
              showFloor
              showInstalled
              disabled={ended || busy}
            />

            <div className="ku-facility-modal-actions ku-review-actions">
              {!ended && (
                <button
                  type="button"
                  className="ku-review-reject"
                  onClick={() => setConfirmReject(true)}
                  disabled={busy}
                >
                  거절
                </button>
              )}
              {!ended && (
                <button
                  type="button"
                  onClick={() =>
                    void changeStatus(
                      detail.status === "reviewing" ? "new" : "reviewing",
                    )
                  }
                  disabled={busy}
                >
                  {detail.status === "reviewing"
                    ? "신규로 되돌리기"
                    : "확인 중으로 표시"}
                </button>
              )}
              {ended && detail.photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => void cleanup()}
                  disabled={busy}
                >
                  남은 사진 정리
                </button>
              )}
              <button type="button" onClick={onClose} disabled={busy}>
                닫기
              </button>
              {!ended && (
                <button
                  type="button"
                  className="ku-review-approve"
                  onClick={() => void approve()}
                  disabled={busy}
                >
                  {busy ? "처리 중..." : "승인하고 등록"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {confirmReject && (
        <ConfirmModal
          message="이 요청을 거절할까요?"
          description="요청 사진은 지워지고 요청은 거절됨으로 남아요."
          confirmLabel="거절"
          pending={busy}
          onConfirm={reject}
          onCancel={() => setConfirmReject(false)}
        />
      )}
    </div>
  );
}
