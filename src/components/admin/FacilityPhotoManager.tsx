"use client";

import { useState } from "react";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";
import { reportFailure } from "@/lib/activityReport";
import { authedFetch } from "@/lib/authedFetch";
import {
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
  byUploadOrder,
} from "@/lib/facilityPhotos";
import { facilityPhotoUrl } from "@/lib/facilityPhotoUrl";
import { convertToWebP } from "@/lib/imageToWebP";
import { readErrorMessage } from "@/lib/responseError";
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

interface UploadFailure {
  message: string;
  type: "error" | "warning";
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

  async function uploadOne(file: File): Promise<UploadFailure | null> {
    let blob: Blob;
    try {
      blob = await convertToWebP(file);
    } catch (error) {
      void reportFailure({
        source: { kind: "known", reason: "unsupported_type", error },
        action: "facility_photo.upload",
        target: { table: "building_facilities", id: facilityId },
        fileSize: file.size,
        fileType: file.type,
      });
      return { message: "사진을 변환하지 못했어요", type: "error" };
    }
    if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
      void reportFailure({
        source: { kind: "known", reason: "payload_too_large" },
        action: "facility_photo.upload",
        target: { table: "building_facilities", id: facilityId },
        fileSize: blob.size,
        fileType: blob.type,
        limit: MAX_FACILITY_PHOTO_BYTES,
      });
      return { message: "사진은 4MB까지 올릴 수 있어요", type: "warning" };
    }
    const form = new FormData();
    form.append("facilityId", facilityId);
    form.append("file", blob, "photo.webp");
    const response = await authedFetch("/api/upload-facility-photo", {
      method: "POST",
      body: form,
    }).catch(() => null);
    if (response?.ok) return null;
    return {
      message: await readErrorMessage(response, "사진을 올리지 못했어요"),
      type: "error",
    };
  }

  async function uploadAll(files: File[]) {
    const room = MAX_FACILITY_PHOTOS - sorted.length;
    if (files.length > room) {
      showToast(
        `사진은 ${MAX_FACILITY_PHOTOS}장까지예요. ${room}장만 골라 주세요`,
        "warning",
      );
      return;
    }
    setPending("upload");
    try {
      const failures: UploadFailure[] = [];
      // 동시에 올리면 같은 sort_order를 잡아 유일 제약에 걸린다.
      for (const file of files) {
        const failure = await uploadOne(file);
        if (failure) failures.push(failure);
      }
      if (failures.length < files.length) await onChanged();
      if (failures.length === 0) return;
      if (files.length === 1) {
        showToast(failures[0].message, failures[0].type);
        return;
      }
      const reasons = [...new Set(failures.map((f) => f.message))].join(" · ");
      showToast(
        `${failures.length}장을 올리지 못했어요 (${reasons})`,
        "warning",
      );
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
            multiple
            className="ku-sr-only"
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) void uploadAll(files);
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
