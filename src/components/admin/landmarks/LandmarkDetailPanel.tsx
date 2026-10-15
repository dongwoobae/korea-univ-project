"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import LandmarkTranslationCard from "@/components/admin/landmarks/LandmarkTranslationCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel from "@/components/admin/workspace/DetailPanel";
import {
  ADMIN_MOBILE_QUERY,
  type DetailDraftPin,
} from "@/components/admin/workspace/types";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { authedFetch } from "@/lib/authedFetch";
import {
  inferCampusFromPoint,
  type CampusBoundaryCollection,
} from "@/lib/campusGeometry";
import { deleteLandmark } from "@/lib/landmarkDelete";
import {
  deleteLandmarkPhoto,
  saveLandmark,
  uploadLandmarkPhoto,
} from "@/lib/landmarkSave";
import {
  buildLandmarkPayload,
  landmarkCampusLabel,
  landmarkDisplayName,
  landmarkFormDirty,
  landmarkFormFromRow,
  validateLandmarkForm,
} from "@/lib/landmarkWorkspace";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Landmark } from "@/types/domain";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** 새 명소에서 고른 사진. 미리보기 주소는 고를 때 만들고 바꾸거나 닫을 때 해제한다 */
interface PendingPhoto {
  file: File;
  previewUrl: string;
}

/** 588KB짜리 이모지 목록이 피커를 열기 전까지 따라오지 않게 한다. */
const EmojiPicker = dynamic(() => import("@/components/admin/EmojiPicker"), {
  ssr: false,
  loading: () => <div className="ku-landmark-picker-loading">불러오는 중…</div>,
});

interface LandmarkDetailPanelProps {
  /** null이면 새 명소 */
  landmark: Landmark | null;
  boundaries: CampusBoundaryCollection | null;
  boundariesError: boolean;
  onDraftChange: (draft: DetailDraftPin) => void;
  /** 다시 받기가 끝난 뒤 돌아온다 */
  onSaved: (landmarkId: string, created: boolean) => Promise<void>;
  onDeleted: (landmarkId: string) => Promise<void>;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
  /**
   * 모바일에서 상세를 접고 지도에서 위치를 고르는 중인지 알린다. 패널이 닫힐 때는 고르던 중이 아니었어도
   * closed와 함께 false가 온다 — 고르기를 마친 것과 패널이 사라진 것을 페이지가 가른다
   */
  onPickingChange: (picking: boolean, closed?: boolean) => void;
}

export default function LandmarkDetailPanel({
  landmark,
  boundaries,
  boundariesError,
  onDraftChange,
  onSaved,
  onDeleted,
  onClose,
  showToast,
  onPickingChange,
}: LandmarkDetailPanelProps) {
  const owner = landmark?.id ?? "new";
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [form, setForm] = useState(() => landmarkFormFromRow(landmark));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "delete" | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  // 위치 고르기를 시작할 때의 좌표. 취소하면 이 값으로 돌린다(새 명소는 빈 값일 수 있다)
  const [pickStart, setPickStart] = useState<{
    lat: string;
    lng: string;
  } | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pickButtonRef = useRef<HTMLButtonElement>(null);
  const pickBarRef = useRef<HTMLDivElement>(null);
  const pickReturnFocusRef = useRef(false);
  const busy = saving || photoBusy !== null;
  // 지도를 바로 누를 수 있는 데스크톱에는 고르기가 없다. 고르는 중에 데스크톱 폭이 되면 상세를 다시 보인다
  const picking = mobile && pickStart !== null;
  const onDraftChangeRef = useRef(onDraftChange);
  const onPickingChangeRef = useRef(onPickingChange);
  const fieldId = useId();
  useUnsavedChanges(
    landmarkFormDirty(form, landmark, pendingPhoto?.file ?? null),
  );

  // 닫을 때(언마운트) 마지막 미리보기 주소를 해제하고, 패널이 사라졌다고 알려 페이지가 고르기와 그 초점을 거두게 한다
  useEffect(
    () => () => {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
      onPickingChangeRef.current(false, true);
    },
    [],
  );

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    onPickingChangeRef.current = onPickingChange;
  }, [onPickingChange]);

  // 고르기 버튼과 확인 바는 서로 자리를 바꾼다. 사라진 쪽에 있던 초점은 body로 떨어지므로 나타난 쪽으로 옮긴다
  useEffect(() => {
    if (picking) {
      pickBarRef.current?.focus();
      return;
    }
    if (!pickReturnFocusRef.current) return;
    pickReturnFocusRef.current = false;
    pickButtonRef.current?.focus();
  }, [picking]);

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
      saving: busy,
      emoji: form.icon,
    });
  }, [owner, form.lat, form.lng, form.icon, busy]);

  const lat = parseFloat(form.lat);
  const lng = parseFloat(form.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const campus = hasPosition
    ? inferCampusFromPoint([lng, lat], boundaries)
    : null;
  // 모바일 상세는 지도를 덮는다. 지도를 누르라는 대신 아래 고르기 버튼으로 이끈다
  const campusText = !hasPosition
    ? mobile
      ? "지도에서 위치를 골라 주세요"
      : "지도를 눌러 위치를 찍어 주세요"
    : !boundaries && !boundariesError
      ? "캠퍼스 영역 확인 중..."
      : campus
        ? mobile
          ? `${campus} 영역`
          : `${campus} 영역 · 지도를 클릭해 위치 변경`
        : boundariesError
          ? "캠퍼스 영역을 확인하지 못했습니다. 저장은 가능합니다."
          : "캠퍼스 영역 밖입니다. 인접 지역 명소라면 그대로 저장할 수 있습니다.";

  async function remove() {
    if (!landmark) return;
    // deleteLandmark는 네트워크 오류면 메시지를 돌려주지 않고 던진다
    const error = await deleteLandmark(landmark).catch(
      () => "명소 삭제에 실패했어요",
    );
    if (error) {
      showToast(error, "error");
      return;
    }
    authedFetch("/api/revalidate-landmarks", { method: "POST" }).catch(
      () => {},
    );
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    showToast("명소가 삭제되었어요");
    await onDeleted(landmark.id);
  }

  function replacePendingPhoto(next: File | null) {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    const previewUrl = next ? URL.createObjectURL(next) : null;
    pendingUrlRef.current = previewUrl;
    setPendingPhoto(next && previewUrl ? { file: next, previewUrl } : null);
  }

  async function handlePhotoChosen(file: File) {
    if (!landmark) {
      replacePendingPhoto(file);
      showToast("명소를 저장할 때 사진도 함께 업로드해요", "warning");
      return;
    }
    setPhotoBusy("upload");
    try {
      await uploadLandmarkPhoto(landmark.id, file);
    } catch (error) {
      setPhotoBusy(null);
      showToast(
        error instanceof Error ? error.message : "사진 업로드 실패",
        "error",
      );
      return;
    }
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    showToast("사진이 업로드되었어요");
    await onSaved(landmark.id, false);
    setPhotoBusy(null);
  }

  async function handlePhotoDelete() {
    if (!landmark) {
      replacePendingPhoto(null);
      return;
    }
    if (!landmark.photo_url) return;
    setPhotoBusy("delete");
    const deleted = await deleteLandmarkPhoto(landmark.id, landmark.photo_url);
    if (!deleted) {
      setPhotoBusy(null);
      showToast("사진 삭제에 실패했어요", "error");
      return;
    }
    showToast("사진이 삭제되었어요");
    await onSaved(landmark.id, false);
    setPhotoBusy(null);
  }

  async function handleSave() {
    const invalid = validateLandmarkForm(form);
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    setSaving(true);
    const result = await saveLandmark(
      landmark?.id ?? null,
      buildLandmarkPayload(form),
      landmark ? null : (pendingPhoto?.file ?? null),
    );
    if (!result.ok) {
      setSaving(false);
      showToast("저장에 실패했어요", "error");
      return;
    }
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    if (result.photoFailed) {
      showToast("명소는 저장됐지만 사진 업로드에 실패했어요", "warning");
    } else {
      showToast(result.created ? "명소가 추가되었어요" : "명소가 수정되었어요");
    }
    await onSaved(result.landmarkId, result.created);
    setSaving(false);
  }

  function startPicking() {
    setPickerOpen(false);
    setPickStart({ lat: form.lat, lng: form.lng });
    onPickingChange(true);
  }

  function finishPicking(keep: boolean) {
    if (!keep && pickStart) {
      const { lat: startLat, lng: startLng } = pickStart;
      setForm((previous) => ({ ...previous, lat: startLat, lng: startLng }));
    }
    pickReturnFocusRef.current = true;
    setPickStart(null);
    onPickingChange(false);
  }

  const photoSrc = landmark ? landmark.photo_url : pendingPhoto?.previewUrl;
  const label = landmark ? landmarkDisplayName(landmark) : "명소 추가";
  const campusLabel = landmark ? landmarkCampusLabel(landmark, boundaries) : "";
  const date = landmark ? formatAdminUpdatedAt(landmark.updated_at) : "";
  const meta = landmark
    ? campusLabel
      ? `${campusLabel} · ${date}`
      : date
    : mobile
      ? "지도에서 위치를 골라요"
      : "지도를 눌러 위치를 찍어요";

  // 모바일 상세는 헤더를 그리지 않으므로(DetailPanel) 같은 버튼을 본문 이름 칸 위에 둔다
  const emojiButton = (
    <button
      type="button"
      className="ku-landmark-emoji-button"
      aria-label={`이모지 ${form.icon} 바꾸기`}
      aria-haspopup="listbox"
      aria-expanded={pickerOpen}
      disabled={busy}
      onClick={() => setPickerOpen((open) => !open)}
    >
      <span aria-hidden="true">{form.icon}</span>
    </button>
  );

  const picker = pickerOpen && (
    <EmojiPicker
      selected={form.icon}
      onSelect={(emoji) => {
        setForm((previous) => ({ ...previous, icon: emoji }));
        setPickerOpen(false);
      }}
      onClose={() => setPickerOpen(false)}
    />
  );

  const fields = (
    <div className="ku-detail-form ku-landmark-fields">
      <label htmlFor={`${fieldId}-name`}>이름 *</label>
      <input
        id={`${fieldId}-name`}
        value={form.name}
        placeholder="예: 다람쥐길"
        disabled={saving}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, name: event.target.value }))
        }
      />
      <label htmlFor={`${fieldId}-description`}>설명</label>
      <textarea
        id={`${fieldId}-description`}
        value={form.description}
        placeholder="명소 설명"
        disabled={saving}
        onChange={(event) =>
          setForm((previous) => ({
            ...previous,
            description: event.target.value,
          }))
        }
      />
    </div>
  );

  // 모바일에서는 핸드오버의 사진 미리보기처럼 본문 맨 위에 넓게 그린다
  const photo = (
    <div className="ku-landmark-photo">
      {!mobile && <span className="ku-detail-label">사진</span>}
      <input
        ref={photoInputRef}
        id={`${fieldId}-photo`}
        type="file"
        accept={PHOTO_ACCEPT}
        className="ku-sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handlePhotoChosen(file);
        }}
      />
      {photoSrc ? (
        <div className="ku-landmark-photo-frame">
          <Image
            src={photoSrc}
            alt="명소 사진"
            fill
            sizes={mobile ? "100vw" : "200px"}
            unoptimized
            style={{ objectFit: "cover" }}
          />
          {photoBusy === "upload" && (
            <span className="ku-landmark-photo-busy">업로드 중...</span>
          )}
          <div className="ku-landmark-photo-actions">
            <button
              type="button"
              aria-label="사진 변경"
              disabled={busy}
              onClick={() => photoInputRef.current?.click()}
            >
              변경
            </button>
            <button
              type="button"
              aria-label="사진 삭제"
              disabled={busy}
              onClick={() => void handlePhotoDelete()}
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={`${fieldId}-photo`}
          className="ku-landmark-photo-frame ku-landmark-photo-empty"
          aria-disabled={busy}
        >
          {photoBusy === "upload" ? "업로드 중..." : "＋ 사진 선택"}
        </label>
      )}
      {pendingPhoto && (
        <p className="ku-landmark-photo-hint">
          저장 시 업로드: {pendingPhoto.file.name}
        </p>
      )}
    </div>
  );

  return (
    <>
      <DetailPanel
        label={label}
        header={
          <div className="ku-detail-title">
            {emojiButton}
            <div>
              <h2>{label}</h2>
              <p>{meta}</p>
            </div>
          </div>
        }
        onClose={onClose}
        closeDisabled={busy}
        remove={
          landmark
            ? {
                confirmMessage: "명소와 사진은 복구할 수 없어요.",
                disabled: busy,
                onConfirm: remove,
              }
            : undefined
        }
        save={{
          pending: saving,
          disabled: busy,
          onClick: () => void handleSave(),
        }}
        mapStrip={false}
        hidden={picking}
      >
        {mobile ? (
          <>
            {photo}
            <div className="ku-landmark-mobile-head">
              {emojiButton}
              <p>{meta}</p>
            </div>
            {picker}
            {fields}
          </>
        ) : (
          <>
            {picker}
            <div className="ku-landmark-body">
              {fields}
              {photo}
            </div>
          </>
        )}

        <LandmarkTranslationCard
          form={form}
          setForm={setForm}
          landmark={landmark}
          disabled={busy}
          showToast={showToast}
        />

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
          {/* 모바일 상세는 지도를 덮어 지도를 바로 누를 수 없다(설계 2026-10-14 2.5) */}
          {mobile && (
            <button
              ref={pickButtonRef}
              type="button"
              className="ku-workspace-button"
              disabled={busy}
              onClick={startPicking}
            >
              지도에서 위치 고르기
            </button>
          )}
        </div>
      </DetailPanel>
      {/* 상세의 형제로 작업 화면 안에 그린다. 지도는 z-index: 0 맥락에 갇혀 있어 이 바가 문서 순서로 그 위에 얹힌다 */}
      {picking && (
        <div
          ref={pickBarRef}
          className="ku-landmark-pick-bar"
          role="region"
          aria-label="위치 고르기"
          tabIndex={-1}
        >
          <div className="ku-landmark-pick-text" aria-live="polite">
            <p>지도를 눌러 위치를 고르세요</p>
            {hasPosition && (
              <p className="ku-landmark-pick-coords">
                {form.lat}, {form.lng}
              </p>
            )}
          </div>
          <div className="ku-landmark-pick-actions">
            <button
              type="button"
              className="ku-workspace-button"
              onClick={() => finishPicking(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="ku-workspace-primary"
              disabled={!hasPosition}
              onClick={() => finishPicking(true)}
            >
              이 위치로
            </button>
          </div>
        </div>
      )}
    </>
  );
}
