"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Feature, Polygon } from "geojson";
import {
  useUnsavedChanges,
  useUnsavedChangesGuard,
} from "@/components/admin/UnsavedChangesGuard";
import { useWorkspaceCloseRequest } from "@/components/admin/workspace/useWorkspaceSelection";
import FacilityFields, {
  ADMIN_FACILITY_FIELD_LABELS,
} from "@/components/facility/FacilityFields";
import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { authedFetch } from "@/lib/authedFetch";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import {
  fieldsFromRequest,
  initialPhotoSelection,
  isReviewDraftDirty,
  requestLocationNote,
  type RequestLocationNote,
} from "@/lib/facilityRequestReview";
import { translateFacility } from "@/lib/facilityTranslation";
import {
  REQUEST_STATUS_LABELS,
  isEndStatus,
  type FacilityRequestDetail,
} from "@/lib/inboxStatus";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
import { readErrorMessage } from "@/lib/responseError";
import { color } from "@/lib/theme";
import InboxDrawer from "./InboxDrawer";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

const LOCATION_NOTE_TEXT: Record<RequestLocationNote, string> = {
  reporter: "제보자가 찍은 위치가 있어요",
  picked: "지도에서 고른 위치예요",
  none: "위치 없음 · 지도에서 찍어 주세요",
};

interface FacilityRequestDrawerProps {
  requestId: string;
  facilityTypes: { code: string; label: string }[];
  /** 확인 없이 드로어를 닫는다. 닫기 요청(가드·바쁨)은 이 드로어가 정한다 */
  onClose: () => void;
  onChanged: () => void;
  showToast: (message: string, type?: string) => void;
  restoreFallbackRef: RefObject<HTMLElement | null>;
}

type DetailResult =
  { body: FacilityRequestDetail } | { response: Response | null };

async function fetchDetail(requestId: string): Promise<DetailResult> {
  const response = await authedFetch(
    `/api/facility-requests/${requestId}`,
  ).catch(() => null);
  const body =
    response?.ok &&
    ((await response.json().catch(() => null)) as FacilityRequestDetail | null);
  return body ? { body } : { response };
}

function receivedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "접수일 없음"
    : `${date.toLocaleDateString("ko-KR")} 접수`;
}

export default function FacilityRequestDrawer({
  requestId,
  facilityTypes,
  onClose,
  onChanged,
  showToast,
  restoreFallbackRef,
}: FacilityRequestDrawerProps) {
  const titleId = useId();
  const fieldId = useId();
  const confirmId = useId();
  const router = useRouter();
  const { guard } = useUnsavedChangesGuard();
  const [detail, setDetail] = useState<FacilityRequestDetail | null>(null);
  const [fields, setFields] = useState<FacilityFieldValues>(
    EMPTY_FACILITY_FIELDS,
  );
  const [publish, setPublish] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const loadedRef = useRef(false);
  const aliveRef = useRef(true);
  const rejectCancelRef = useRef<HTMLButtonElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);

  const ended = detail ? isEndStatus(detail.status) : true;
  useUnsavedChanges(
    detail ? isReviewDraftDirty(detail, fields, publish) : false,
  );

  // 닫기 길(✕·배경·Esc·같은 화면 헤더 링크)은 모두 이 하나를 지난다. 바쁜 동안은 닫지 않는다.
  const requestDrawerClose = () => {
    if (!busy) guard(onClose);
  };
  useWorkspaceCloseRequest(true, requestDrawerClose);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const applyDetail = useCallback((body: FacilityRequestDetail) => {
    setDetail(body);
    // 다시 읽은 요청이 아직 처리 전이면 관리자가 고치던 값과 사진 선택을 그대로 둔다.
    if (loadedRef.current && !isEndStatus(body.status)) return;
    loadedRef.current = true;
    setFields(fieldsFromRequest(body));
    setPublish(initialPhotoSelection(body));
  }, []);

  // 드로어를 닫는 것은 처음 여는 조회가 실패했을 때뿐이다. 그 뒤의 다시 읽기 실패는 화면을 그대로 둔다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchDetail(requestId);
      if (cancelled) return;
      if (!("body" in result)) {
        showToast(
          await readErrorMessage(result.response, "요청을 불러오지 못했어요"),
          "error",
        );
        onClose();
        return;
      }
      applyDetail(result.body);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, onClose, showToast, applyDetail]);

  // 삭제 확인처럼 거절 버튼과 확인 칸이 자리를 바꾼다. 사라진 쪽의 초점은 나타난 쪽으로 옮긴다.
  useEffect(() => {
    if (confirmingReject) {
      rejectCancelRef.current?.focus();
      return;
    }
    if (!returnFocusRef.current) return;
    returnFocusRef.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) rejectTriggerRef.current?.focus();
  }, [confirmingReject]);

  function closeRejectConfirm() {
    returnFocusRef.current = true;
    setConfirmingReject(false);
  }

  /** 상세를 다시 읽는다. 성공하면 true. 끝 상태여야 하는데 아직 처리 전이면 낡은 응답으로 보고 버린다. */
  async function reread(expectEnded: boolean) {
    const result = await fetchDetail(requestId);
    if (!aliveRef.current) return true;
    if (!("body" in result)) return false;
    if (expectEnded && !isEndStatus(result.body.status)) return false;
    applyDetail(result.body);
    return true;
  }

  // 실패 응답이면 안내하고 보드를 다시 받는다. 서버 상태를 모르면 상세도 다시 읽어 낡은 화면으로 두지 않는다.
  async function failed(
    response: Response | null,
    fallback: string,
    rereadDetail: boolean,
  ) {
    showToast(await readErrorMessage(response, fallback), "error");
    onChanged();
    if (rereadDetail) await reread(false);
  }

  async function changeStatus(status: "new" | "reviewing") {
    setBusy(true);
    try {
      const response = await authedFetch(
        `/api/facility-requests/${requestId}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      ).catch(() => null);
      if (!response?.ok) {
        await failed(
          response,
          "상태를 바꾸지 못했어요",
          response?.status === 409,
        );
        return;
      }
      setDetail((previous) => (previous ? { ...previous, status } : previous));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!fields.facility_code) {
      showToast("시설 유형을 선택해주세요", "warning");
      return;
    }
    setBusy(true);
    try {
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
        // 응답을 잃었거나 서버가 결과를 확인하지 못했으면 승인됐을 수도 있어 항상 다시 읽는다.
        await failed(response, "승인하지 못했어요", true);
        return;
      }
      const { facilityId, cleanupFailed } = (await response.json()) as {
        facilityId: string;
        cleanupFailed: boolean;
      };
      // 값은 바로 읽기 전용이 되고 저장 안 한 변경이 풀린다. 이어지는 일이 끝날 때까지 busy는 유지한다.
      setDetail((previous) =>
        previous
          ? { ...previous, status: "approved", facility_id: facilityId }
          : previous,
      );
      const translated = await translateFacility(facilityId);
      await authedFetch("/api/revalidate-facilities", {
        method: "POST",
      }).catch(() => {});
      onChanged();
      const refreshed = await reread(true);
      showToast(
        !translated
          ? "등록했지만 자동 번역에 실패했어요. 건물 화면에서 재번역해 주세요."
          : cleanupFailed
            ? "등록했어요. 요청 사진 정리는 실패해 다시 해야 해요."
            : !refreshed
              ? "등록했어요. 요청 상태를 다시 읽지 못했어요."
              : "등록했어요!",
        !translated || cleanupFailed || !refreshed ? "warning" : "success",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rejectRequest() {
    setBusy(true);
    try {
      const response = await authedFetch(
        `/api/facility-requests/${requestId}/reject`,
        { method: "POST" },
      ).catch(() => null);
      closeRejectConfirm();
      if (!response?.ok) {
        await failed(response, "거절하지 못했어요", response?.status === 409);
        return;
      }
      const { cleanupFailed } = (await response.json()) as {
        cleanupFailed: boolean;
      };
      setDetail((previous) =>
        previous ? { ...previous, status: "rejected" } : previous,
      );
      onChanged();
      const refreshed = await reread(true);
      showToast(
        cleanupFailed
          ? "거절했지만 사진을 지우지 못했어요"
          : !refreshed
            ? "거절했어요. 요청 상태를 다시 읽지 못했어요."
            : "거절했어요",
        cleanupFailed || !refreshed ? "warning" : "success",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    setBusy(true);
    try {
      const response = await authedFetch(
        `/api/facility-requests/${requestId}/cleanup`,
        { method: "POST" },
      ).catch(() => null);
      if (!response?.ok) {
        await failed(
          response,
          "사진을 지우지 못했어요",
          response?.status === 409,
        );
        return;
      }
      setDetail((previous) =>
        previous ? { ...previous, photos: [] } : previous,
      );
      onChanged();
      showToast("남은 사진을 정리했어요");
    } finally {
      setBusy(false);
    }
  }

  // 드로어 안 링크는 저장 안 한 변경을 묻고 바쁜 동안은 따라가지 않는다. 새 탭 같은 수정 클릭은 그대로 둔다.
  function guardedLink(href: string) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      if (!busy) guard(() => router.push(href));
    };
  }

  const center: [number, number] =
    detail?.lat != null && detail?.lng != null
      ? [detail.lat, detail.lng]
      : getPolygonRingCenter(
          (detail?.building?.geojson as Feature<Polygon> | null) ?? null,
        );
  const typeLabel =
    facilityTypes.find((type) => type.code === detail?.facility_code)?.label ??
    "시설";
  const buildingHref = detail ? `/admin/buildings/${detail.building_id}` : "";
  const locationNote = detail ? requestLocationNote(detail, fields) : "none";

  const header = (
    <div className="ku-inbox-drawer-title">
      <span
        className="ku-inbox-drawer-icon"
        style={{
          background: getFacilityMarkerColor(detail?.facility_code ?? ""),
        }}
        aria-hidden="true"
      >
        <FacilityTypeIcon code={detail?.facility_code} size={22} />
      </span>
      <div>
        <h2 id={titleId}>{typeLabel} 등록 요청</h2>
        {detail && (
          <p>
            <span className="ku-inbox-status" data-status={detail.status}>
              {REQUEST_STATUS_LABELS[detail.status]}
            </span>
            <Link href={buildingHref} onClick={guardedLink(buildingHref)}>
              {detail.building?.name ?? `건물 ${detail.building_id}`}
            </Link>
            <span>· {receivedAt(detail.created_at)}</span>
          </p>
        )}
      </div>
    </div>
  );

  const footer = !detail ? null : ended ? (
    <>
      <span className="ku-inbox-end-note" data-status={detail.status}>
        {detail.status === "approved"
          ? "승인되어 시설로 등록됐어요"
          : "거절된 요청이에요"}
      </span>
      {detail.status === "approved" && (
        <Link
          className="ku-inbox-end-link"
          href={buildingHref}
          onClick={guardedLink(buildingHref)}
        >
          만들어진 시설 보기 →
        </Link>
      )}
      <span className="ku-detail-panel-spacer" />
      {detail.photos.length > 0 && (
        <button
          type="button"
          className="ku-workspace-button"
          onClick={() => void cleanup()}
          disabled={busy}
        >
          남은 사진 정리
        </button>
      )}
    </>
  ) : confirmingReject ? (
    <div
      className="ku-inbox-reject-confirm"
      role="group"
      aria-label="거절 확인"
      aria-describedby={confirmId}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.stopPropagation();
        closeRejectConfirm();
      }}
    >
      <span id={confirmId}>
        거절할까요? 요청 사진은 지워지고 거절됨으로 남아요.
      </span>
      <button
        ref={rejectCancelRef}
        type="button"
        className="ku-workspace-button"
        onClick={closeRejectConfirm}
        disabled={busy}
      >
        취소
      </button>
      <button
        type="button"
        className="ku-workspace-button ku-workspace-button--danger"
        onClick={() => void rejectRequest()}
        disabled={busy}
      >
        {busy ? "거절 중..." : "거절"}
      </button>
    </div>
  ) : (
    <>
      <button
        ref={rejectTriggerRef}
        type="button"
        className="ku-workspace-button ku-inbox-reject"
        onClick={() => setConfirmingReject(true)}
        disabled={busy}
      >
        거절
      </button>
      <button
        type="button"
        className="ku-workspace-button"
        onClick={() =>
          void changeStatus(detail.status === "reviewing" ? "new" : "reviewing")
        }
        disabled={busy}
      >
        {detail.status === "reviewing" ? "신규로 되돌리기" : "확인 중으로 표시"}
      </button>
      <span className="ku-detail-panel-spacer" />
      {detail.photos.length > 0 && (
        <span className="ku-detail-panel-note">
          사진 {publish.size}/{detail.photos.length}장 공개
        </span>
      )}
      <button
        type="button"
        className="ku-workspace-primary"
        onClick={() => void approve()}
        disabled={busy}
      >
        {busy ? "처리 중..." : "승인하고 등록"}
      </button>
    </>
  );

  return (
    <InboxDrawer
      titleId={titleId}
      header={header}
      footer={footer}
      onRequestClose={requestDrawerClose}
      closeOnEscape={!busy && !confirmingReject}
      restoreFallbackRef={restoreFallbackRef}
    >
      {!detail ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : (
        <>
          <div>
            <div className="ku-inbox-photos-head">
              <span>제보 사진</span>
              {!ended && detail.photos.length > 0 && (
                <span>체크한 사진만 공개돼요</span>
              )}
            </div>
            {detail.photos.length > 0 ? (
              <ul className="ku-inbox-photos" aria-label="요청 사진">
                {detail.photos.map((photo, index) => {
                  const tile = photo.url ? (
                    // 비공개 버킷의 서명 주소라 next/image 최적화를 거치지 않는다.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={`요청 사진 ${index + 1}`} />
                  ) : (
                    <span className="ku-inbox-photo-missing">볼 수 없음</span>
                  );
                  if (ended) {
                    return (
                      <li key={photo.id}>
                        <div className="ku-inbox-photo">{tile}</div>
                      </li>
                    );
                  }
                  const selected = publish.has(photo.id);
                  return (
                    <li key={photo.id}>
                      <label
                        className="ku-inbox-photo"
                        data-selected={selected}
                        data-disabled={!photo.url}
                      >
                        {tile}
                        <span
                          className="ku-inbox-photo-check"
                          aria-hidden="true"
                        >
                          {selected ? "✓" : ""}
                        </span>
                        <input
                          type="checkbox"
                          aria-label={`사진 ${index + 1} 공개`}
                          checked={selected}
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
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="ku-inbox-column-empty">첨부된 사진이 없어요</div>
            )}
          </div>
          <div className="ku-inbox-drawer-columns">
            <div className="ku-detail-form">
              <FacilityFields
                idPrefix={fieldId}
                value={fields}
                onChange={setFields}
                facilityTypes={facilityTypes}
                labels={ADMIN_FACILITY_FIELD_LABELS}
                mapCenter={center}
                showFloor
                showInstalled
                showLocation={false}
                disabled={ended || busy}
              />
            </div>
            <div className="ku-inbox-drawer-location">
              <span className="ku-detail-label">위치</span>
              {/* Leaflet 안쪽의 z-index가 드로어 밖으로 새지 않게 이 상자가 가둔다 */}
              <div className="ku-inbox-drawer-map">
                <FacilityMap
                  center={center}
                  height={240}
                  highlightId={detail.building_id}
                  highlightColor={color.crimson600}
                  markerPosition={
                    fields.lat && fields.lng
                      ? [parseFloat(fields.lat), parseFloat(fields.lng)]
                      : null
                  }
                  onMapClick={(lat, lng) => {
                    if (ended || busy) return;
                    setFields((previous) => ({
                      ...previous,
                      lat: lat.toFixed(7),
                      lng: lng.toFixed(7),
                    }));
                  }}
                />
              </div>
              <span className="ku-inbox-location-note" data-tone={locationNote}>
                {LOCATION_NOTE_TEXT[locationNote]}
              </span>
            </div>
          </div>
        </>
      )}
    </InboxDrawer>
  );
}
