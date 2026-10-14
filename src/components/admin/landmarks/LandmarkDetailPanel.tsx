"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import LandmarkTranslationCard from "@/components/admin/landmarks/LandmarkTranslationCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel from "@/components/admin/workspace/DetailPanel";
import type { DetailDraftPin } from "@/components/admin/workspace/types";
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
}: LandmarkDetailPanelProps) {
  const owner = landmark?.id ?? "new";
  const [form, setForm] = useState(() => landmarkFormFromRow(landmark));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "delete" | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const busy = saving || photoBusy !== null;
  const onDraftChangeRef = useRef(onDraftChange);
  const fieldId = useId();
  useUnsavedChanges(
    landmarkFormDirty(form, landmark, pendingPhoto?.file ?? null),
  );

  // 닫을 때(언마운트) 마지막 미리보기 주소를 해제한다
  useEffect(
    () => () => {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

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
  const campusText = !hasPosition
    ? "지도를 눌러 위치를 찍어 주세요"
    : !boundaries && !boundariesError
      ? "캠퍼스 영역 확인 중..."
      : campus
        ? `${campus} 영역 · 지도를 클릭해 위치 변경`
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
    await onDeleted(landmark.id);
    showToast("명소가 삭제되었어요");
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
    await onSaved(landmark.id, false);
    setPhotoBusy(null);
    showToast("사진이 업로드되었어요");
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
    await onSaved(landmark.id, false);
    setPhotoBusy(null);
    showToast("사진이 삭제되었어요");
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
    await onSaved(result.landmarkId, result.created);
    setSaving(false);
    if (result.photoFailed) {
      showToast("명소는 저장됐지만 사진 업로드에 실패했어요", "warning");
      return;
    }
    showToast(result.created ? "명소가 추가되었어요" : "명소가 수정되었어요");
  }

  const photoSrc = landmark ? landmark.photo_url : pendingPhoto?.previewUrl;
  const label = landmark ? landmarkDisplayName(landmark) : "명소 추가";
  const campusLabel = landmark ? landmarkCampusLabel(landmark, boundaries) : "";
  const date = landmark ? formatAdminUpdatedAt(landmark.updated_at) : "";

  return (
    <DetailPanel
      label={label}
      header={
        <div className="ku-detail-title">
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
          <div>
            <h2>{label}</h2>
            <p>
              {landmark
                ? campusLabel
                  ? `${campusLabel} · ${date}`
                  : date
                : "지도를 눌러 위치를 찍어요"}
            </p>
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
    >
      {pickerOpen && (
        <EmojiPicker
          selected={form.icon}
          onSelect={(emoji) => {
            setForm((previous) => ({ ...previous, icon: emoji }));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="ku-landmark-body">
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
        <div className="ku-landmark-photo">
          <span className="ku-detail-label">사진</span>
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
                sizes="200px"
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
      </div>

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
      </div>
    </DetailPanel>
  );
}
