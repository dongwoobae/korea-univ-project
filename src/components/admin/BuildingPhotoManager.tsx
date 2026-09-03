"use client";

import { useCallback, useEffect, useState } from "react";
import NextImage from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { convertToWebP } from "@/lib/imageToWebP";
import ConfirmModal from "@/components/ConfirmModal";
import type { BuildingPhoto } from "@/types/domain";

type PhotoUploadStatus =
  "queued" | "compressing" | "uploading" | "success" | "error";

interface PhotoUploadItem {
  id: string;
  file: File;
  status: PhotoUploadStatus;
  error?: string;
}

const photoUploadStatusLabel: Record<PhotoUploadStatus, string> = {
  queued: "대기 중",
  compressing: "압축 중",
  uploading: "업로드 중",
  success: "완료",
  error: "실패",
};

export default function BuildingPhotoManager({
  buildingId,
  showToast,
}: {
  buildingId: number;
  showToast: (message: string, type?: string) => void;
}) {
  const [photos, setPhotos] = useState<BuildingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<PhotoUploadItem[]>([]);
  const [confirmDeletePhoto, setConfirmDeletePhoto] =
    useState<BuildingPhoto | null>(null);
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>(
    {},
  );
  const [savingCaption, setSavingCaption] = useState<number | null>(null);

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from("building_photos")
      .select("*")
      .eq("building_id", buildingId)
      .order("created_at");
    setPhotos(data ?? []);
    const initial: Record<string, string> = {};
    (data ?? []).forEach((p) => {
      initial[p.id] = p.caption ?? "";
    });
    setDraftCaptions(initial);
  }, [buildingId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchPhotos(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchPhotos]);

  async function handleSaveCaption(photoId: number) {
    const caption = draftCaptions[photoId] ?? "";
    const original = photos.find((p) => p.id === photoId)?.caption ?? "";
    if (caption === original) return;
    setSavingCaption(photoId);

    const updateData = {
      caption: caption || null,
      caption_en: null,
      caption_zh: null,
    };

    if (caption) {
      try {
        const res = await authedFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: { caption } }),
        });
        if (!res.ok) throw new Error("translate failed");
        const { en, zh } = await res.json();
        updateData.caption_en = en.caption ?? null;
        updateData.caption_zh = zh.caption ?? null;
      } catch {
        // 번역 실패해도 캡션 저장은 진행
      }
    }

    const { error } = await supabase
      .from("building_photos")
      .update(updateData)
      .eq("id", photoId);
    setSavingCaption(null);
    if (error) {
      showToast("캡션 저장 실패", "error");
      return;
    }
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, ...updateData } : p)),
    );
  }

  function updateUploadItem(
    id: string,
    status: PhotoUploadStatus,
    error?: string,
  ) {
    setUploadItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status, error } : item,
      ),
    );
  }

  async function uploadPhoto(item: PhotoUploadItem) {
    updateUploadItem(item.id, "compressing");
    let blob: Blob;
    try {
      blob = await convertToWebP(item.file);
    } catch (error) {
      return {
        ...item,
        status: "error" as const,
        error:
          error instanceof Error ? error.message : "이미지 압축에 실패했어요",
      };
    }

    updateUploadItem(item.id, "uploading");
    const formData = new FormData();
    formData.append("file", blob, "photo.webp");
    formData.append("buildingId", String(buildingId));
    formData.append("originalName", item.file.name);

    try {
      const res = await authedFetch("/api/upload-building-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        return {
          ...item,
          status: "error" as const,
          error: data.error ?? `서버 응답 오류 (${res.status})`,
        };
      }
      return { ...item, status: "success" as const, error: undefined };
    } catch {
      return {
        ...item,
        status: "error" as const,
        error: "네트워크 오류가 발생했어요",
      };
    }
  }

  async function runUploads(
    targets: PhotoUploadItem[],
    existingSuccessCount: number,
  ) {
    if (targets.length === 0) return;
    setUploading(true);
    const results: PhotoUploadItem[] = [];
    for (const target of targets) {
      const result = await uploadPhoto(target);
      results.push(result);
      updateUploadItem(result.id, result.status, result.error);
    }

    await fetchPhotos();
    setUploading(false);
    const successCount =
      existingSuccessCount +
      results.filter((item) => item.status === "success").length;
    const failureCount = results.filter(
      (item) => item.status === "error",
    ).length;
    showToast(
      failureCount > 0
        ? `${successCount}장 업로드 완료 · ${failureCount}장 실패`
        : `${successCount}장 업로드됐어요!`,
      failureCount > 0 ? "warning" : "success",
    );
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files as FileList);
    e.target.value = "";
    if (!files.length) return;
    const batchId = Date.now();
    const items = files.map((file, index) => ({
      id: `${batchId}-${index}`,
      file,
      status: "queued" as const,
    }));
    setUploadItems(items);
    await runUploads(items, 0);
  }

  async function handleRetryFailed() {
    const failed = uploadItems
      .filter((item) => item.status === "error")
      .map((item) => ({
        ...item,
        status: "queued" as const,
        error: undefined,
      }));
    const failedIds = new Set(failed.map((item) => item.id));
    setUploadItems((current) =>
      current.map((item) =>
        failedIds.has(item.id)
          ? { ...item, status: "queued", error: undefined }
          : item,
      ),
    );
    await runUploads(
      failed,
      uploadItems.filter((item) => item.status === "success").length,
    );
  }

  async function handleDelete(photo: BuildingPhoto) {
    const res = await authedFetch("/api/delete-building-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: photo.id, url: photo.url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`삭제 실패: ${data.error}`, "error");
      return;
    }
    setConfirmDeletePhoto(null);
    await fetchPhotos();
    showToast("사진이 삭제되었어요");
  }

  return (
    <>
      {photos.length === 0 ? (
        <div
          style={{
            width: "100%",
            height: 120,
            background: "var(--ku-border)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ku-text-3)",
            fontSize: 13,
          }}
        >
          등록된 사진 없음
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ position: "relative", aspectRatio: "4/3" }}>
                <NextImage
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  fill
                  sizes="(max-width: 767px) 30vw, 180px"
                  unoptimized
                  style={{
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
                <button
                  onClick={() => setConfirmDeletePhoto(photo)}
                  className="ku-photo-delete-button"
                  aria-label="사진 삭제"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--ku-overlay)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
              <input
                value={draftCaptions[photo.id] ?? ""}
                onChange={(e) =>
                  setDraftCaptions((prev) => ({
                    ...prev,
                    [photo.id]: e.target.value,
                  }))
                }
                onBlur={() => handleSaveCaption(photo.id)}
                aria-label="사진 설명"
                placeholder="설명 추가..."
                maxLength={100}
                style={{
                  width: "100%",
                  fontSize: 11,
                  padding: "4px 6px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 4,
                  outline: "none",
                  color: "var(--ku-text-1)",
                  background:
                    savingCaption === photo.id
                      ? "var(--ku-divider)"
                      : "var(--ku-surface)",
                }}
              />
            </div>
          ))}
        </div>
      )}
      <label
        className="ku-file-trigger ku-file-trigger--filled"
        data-disabled={uploading}
        style={{ marginTop: 12 }}
      >
        {uploading ? "업로드 중..." : "사진 추가"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
      {uploadItems.length > 0 && (
        <div
          className="ku-photo-upload-panel"
          aria-label="사진 업로드 진행 상황"
        >
          <div
            className="ku-photo-upload-summary"
            role="status"
            aria-live="polite"
            aria-label={`성공 ${
              uploadItems.filter((item) => item.status === "success").length
            }개 · 실패 ${
              uploadItems.filter((item) => item.status === "error").length
            }개${uploading ? " · 처리 중" : ""}`}
          >
            성공{" "}
            {uploadItems.filter((item) => item.status === "success").length}개 ·
            실패 {uploadItems.filter((item) => item.status === "error").length}
            개{uploading ? " · 처리 중" : ""}
          </div>
          <ul className="ku-photo-upload-list">
            {uploadItems.map((item) => (
              <li key={item.id} data-status={item.status}>
                <span className="ku-photo-upload-name" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="ku-photo-upload-state">
                  {photoUploadStatusLabel[item.status]}
                  {item.error ? ` · ${item.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {!uploading &&
            uploadItems.some((item) => item.status === "error") && (
              <button
                type="button"
                className="ku-photo-upload-retry"
                onClick={handleRetryFailed}
              >
                실패한 사진 다시 시도
              </button>
            )}
          {!uploading &&
            uploadItems.every((item) => item.status === "success") && (
              <button
                type="button"
                className="ku-photo-upload-clear"
                onClick={() => setUploadItems([])}
              >
                업로드 결과 닫기
              </button>
            )}
        </div>
      )}
      {confirmDeletePhoto && (
        <ConfirmModal
          message="사진을 삭제할까요?"
          description="삭제한 사진은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDeletePhoto)}
          onCancel={() => setConfirmDeletePhoto(null)}
        />
      )}
    </>
  );
}
