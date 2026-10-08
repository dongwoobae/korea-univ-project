"use client";

import { useState } from "react";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";
import { authedFetch } from "@/lib/authedFetch";
import {
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
  byUploadOrder,
} from "@/lib/facilityPhotos";
import { facilityPhotoUrl } from "@/lib/facilityPhotoUrl";
import { convertToWebP } from "@/lib/imageToWebP";
import type { FacilityPhoto } from "@/types/domain";

interface FacilityPhotoManagerProps {
  facilityId: string;
  photos: Pick<
    FacilityPhoto,
    "id" | "storage_path" | "sort_order" | "created_at"
  >[];
  onChanged: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

export default function FacilityPhotoManager({
  facilityId,
  photos,
  onChanged,
  showToast,
}: FacilityPhotoManagerProps) {
  const [pending, setPending] = useState<"upload" | "delete" | null>(null);
  const busy = pending !== null;
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sorted = [...photos].sort(byUploadOrder);

  async function upload(file: File) {
    setPending("upload");
    try {
      let blob: Blob;
      try {
        blob = await convertToWebP(file);
      } catch {
        showToast("사진을 변환하지 못했어요", "error");
        return;
      }
      if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
        showToast("사진은 4MB까지 올릴 수 있어요", "warning");
        return;
      }
      const form = new FormData();
      form.append("facilityId", facilityId);
      form.append("file", blob, "photo.webp");
      const response = await authedFetch("/api/upload-facility-photo", {
        method: "POST",
        body: form,
      }).catch(() => null);
      if (!response?.ok) {
        showToast(
          response
            ? await readError(response, "사진을 올리지 못했어요")
            : "사진을 올리지 못했어요",
          "error",
        );
        return;
      }
      await onChanged();
    } finally {
      setPending(null);
    }
  }

  async function remove(photoId: string) {
    setPending("delete");
    const response = await authedFetch("/api/delete-facility-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    }).catch(() => null);
    setConfirmDeleteId(null);
    // 404는 다른 화면에서 이미 지운 것이다. 목록만 다시 읽는다.
    if (!response?.ok && response?.status !== 404) {
      setPending(null);
      showToast("사진을 지우지 못했어요", "error");
      return;
    }
    await onChanged();
    setPending(null);
  }

  return (
    <div className="ku-facility-photo-manager">
      {sorted.map((photo, index) => (
        <div key={photo.id} className="ku-facility-photo-manager-item">
          <Image
            src={facilityPhotoUrl(photo.storage_path)}
            alt={`사진 ${index + 1}`}
            width={64}
            height={64}
            unoptimized
          />
          <button
            type="button"
            aria-label={`사진 ${index + 1} 삭제`}
            onClick={() => setConfirmDeleteId(photo.id)}
            disabled={busy}
          >
            ✕
          </button>
        </div>
      ))}
      {sorted.length < MAX_FACILITY_PHOTOS && (
        <label
          className="ku-facility-photo-manager-add"
          data-busy={busy || undefined}
        >
          {pending === "upload" ? "올리는 중..." : "＋ 사진 추가"}
          <input
            type="file"
            accept="image/*"
            className="ku-sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      )}
      {confirmDeleteId && (
        <ConfirmModal
          message="사진을 삭제할까요?"
          description="지도에 공개된 사진이 바로 사라져요."
          pending={busy}
          onConfirm={() => remove(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
