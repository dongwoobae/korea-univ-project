"use client";

import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import ConfirmModal from "@/components/ConfirmModal";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { useModalFocus } from "@/lib/useModalFocus";
import type { FacilityWithType } from "@/types/domain";
import { isVideoPlayable } from "@/lib/videoPlayback";
import { compressVideo, terminateFFmpeg } from "@/lib/compressVideo";
import {
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  formatExcessSize,
} from "@/lib/videoUpload";

export default function FacilityVideoModal({
  facility,
  onUpdate,
  showToast,
  onClose,
}: {
  facility: FacilityWithType;
  onUpdate: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
  onClose: () => void;
}) {
  // null | "checking" | "loading" | "compressing" | "preparing" | "uploading"
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [draftCaption, setDraftCaption] = useState(
    facility.video_caption ?? "",
  );
  const [savingCaption, setSavingCaption] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState(facility.video_url);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const busy = phase !== null;
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: handleCloseRequest,
  });

  // ffmpeg 인스턴스는 세션 내 재업로드를 위해 캐싱되므로, 모달이 닫힐 때 정리한다.
  useEffect(() => terminateFFmpeg, []);

  function handleCloseRequest() {
    if (busy) {
      setConfirmCancel(true);
    } else {
      onClose();
    }
  }

  async function handleForceClose() {
    if (xhrRef.current) xhrRef.current.abort();
    onUpdate();
    onClose();
  }

  async function handleSaveCaption() {
    const caption = draftCaption.trim();
    if (caption === (facility.video_caption ?? "")) return;
    setSavingCaption(true);

    const updateData = {
      video_caption: caption || null,
      video_caption_en: null,
      video_caption_zh: null,
    };

    if (caption) {
      try {
        const res = await authedFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: { video_caption: caption } }),
        });
        if (!res.ok) throw new Error("translate failed");
        const { en, zh } = await res.json();
        updateData.video_caption_en = en.video_caption ?? null;
        updateData.video_caption_zh = zh.video_caption ?? null;
      } catch {
        // 번역 실패해도 캡션 저장은 진행
      }
    }

    const { error } = await supabase
      .from("building_facilities")
      .update(updateData)
      .eq("id", facility.id);
    setSavingCaption(false);
    if (error) {
      showToast("캡션 저장 실패", "error");
      return;
    }
    onUpdate();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. 브라우저가 이 파일의 비디오 트랙을 디코드할 수 있는지 먼저 확인한다.
      //    아이폰 기본 촬영물(HEVC)은 mp4/mov 컨테이너라 형식 검사를 통과하지만
      //    공개 화면에서 소리만 나고 화면이 검게 나오므로, 재생 불가일 때만
      //    H.264로 변환해 올린다. 이미 재생 가능한 파일은 변환하지 않는다.
      setPhase("checking");
      let payload: Blob = file;
      let contentType = file.type;
      let converted = false;

      if (!(await isVideoPlayable(file))) {
        try {
          payload = await compressVideo(file, setProgress, setPhase);
          contentType = "video/mp4";
          converted = true;
        } catch {
          showToast(
            "이 영상은 브라우저에서 재생할 수 없고 변환도 실패했어요. H.264(mp4)로 저장해 다시 올려주세요",
            "error",
          );
          return;
        }
      }

      // 상한은 **실제로 올라가는 payload**에만 건다. 원본으로 미리 막으면
      // 변환하면 상한 아래로 내려오는 파일(고압축이 아닌 큰 HEVC 등)이
      // 변환도 못 해보고 튕긴다 — 원래 되던 업로드였다.
      if (exceedsVideoLimit(payload.size)) {
        showToast(
          `${converted ? "변환 결과가" : "파일이"} 너무 커요 (${formatExcessSize(payload.size)}) · 최대 ${MAX_VIDEO_LABEL}`,
          "error",
        );
        return;
      }

      // 2. Presigned URL 발급
      setPhase("preparing");
      setProgress(0);
      const presignRes = await authedFetch("/api/facility-video-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: facility.id,
          contentType,
          fileSize: payload.size,
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || presignData.error) {
        showToast(`준비 실패: ${presignData.error}`, "error");
        return;
      }

      // 3. R2에 직접 업로드
      setPhase("uploading");
      setProgress(0);
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable)
            setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error("네트워크 오류"));
        xhr.onabort = () => reject(new Error("업로드 취소됨"));
        xhr.open("PUT", presignData.presignedUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(payload);
      });

      if (xhr.status !== 200) {
        showToast("업로드 실패", "error");
        return;
      }

      // 4. DB에 URL 저장
      const confirmRes = await authedFetch("/api/facility-video-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: facility.id,
          videoUrl: presignData.publicUrl,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || confirmData.error) {
        showToast(`저장 실패: ${confirmData.error}`, "error");
        return;
      }

      setCurrentVideoUrl(presignData.publicUrl);
      showToast("동영상이 업로드됐어요!");
      onUpdate();
    } catch (err) {
      if ((err as Error).message !== "업로드 취소됨")
        showToast("네트워크 오류가 발생했어요", "error");
    } finally {
      setPhase(null);
      setProgress(0);
      e.target.value = "";
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authedFetch("/api/delete-facility-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId: facility.id,
          videoUrl: currentVideoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast(`삭제 실패: ${data.error}`, "error");
        return;
      }
      setCurrentVideoUrl(null);
      showToast("동영상이 삭제됐어요");
      onUpdate();
    } catch {
      showToast("네트워크 오류가 발생했어요", "error");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const phaseLabel =
    phase === "checking"
      ? "영상 확인 중..."
      : phase === "loading"
        ? "변환 도구 불러오는 중..."
        : phase === "compressing"
          ? `재생 가능한 형식으로 변환 중... ${progress}%`
          : phase === "preparing"
            ? "업로드 준비 중..."
            : phase === "uploading"
              ? `업로드 중... ${progress}%`
              : null;

  // 진행률을 알 수 없는 단계는 불확정(shimmer) 바로 표시한다.
  const indeterminate =
    phase === "checking" || phase === "loading" || phase === "preparing";

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={handleCloseRequest}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(0,0,0,0.5)",
          cursor: "default",
        }}
      />
      {/* 모달 카드 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1101,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            width: "min(480px, 92vw)",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            pointerEvents: "all",
          }}
        >
          {/* 모달 헤더 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <FacilityTypeIcon
                  code={facility.facility_types?.code}
                  size={15}
                />
                {facility.name ?? facility.facility_types?.label}
              </div>
              <div
                id={titleId}
                style={{ fontSize: 12, color: "#888", marginTop: 2 }}
              >
                동영상 관리
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseRequest}
              aria-label="닫기"
              style={{
                background: "none",
                border: "none",
                fontSize: 18,
                color: "#888",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          </div>

          {/* 모달 본문 */}
          <div style={{ padding: 16 }}>
            {/* 진행 상태 */}
            {busy && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                  {phaseLabel}
                </div>
                {phase === "loading" && (
                  <div
                    style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}
                  >
                    브라우저 캐싱되어 다음 업로드부터는 로딩하지 않습니다.
                  </div>
                )}
                <div
                  style={{
                    height: 6,
                    background: "#e5e7eb",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  {indeterminate ? (
                    <div
                      style={{
                        height: "100%",
                        width: "40%",
                        background: "#9ca3af",
                        borderRadius: 99,
                        animation: "shimmer 1.2s ease-in-out infinite",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: "100%",
                        width: `${progress}%`,
                        background: "#2563EB",
                        borderRadius: 99,
                        transition: "width 0.2s",
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {currentVideoUrl ? (
              <>
                <video
                  src={currentVideoUrl}
                  controls
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    background: "#000",
                    maxHeight: 260,
                  }}
                />
                <input
                  value={draftCaption}
                  onChange={(e) => setDraftCaption(e.target.value)}
                  onBlur={handleSaveCaption}
                  aria-label="동영상 설명"
                  placeholder="동영상 설명 추가..."
                  maxLength={150}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    fontSize: 13,
                    padding: "7px 10px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    outline: "none",
                    color: "#374151",
                    background: savingCaption ? "#f9fafb" : "#fff",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <label
                    className="ku-file-trigger"
                    data-disabled={busy}
                    style={{ flex: 1 }}
                  >
                    {phaseLabel ?? "동영상 교체"}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={handleUpload}
                      disabled={busy}
                    />
                  </label>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting || busy}
                    className="ku-admin-button ku-admin-button--danger ku-admin-row-action ku-admin-row-action--danger"
                    style={{ flex: 1 }}
                  >
                    {deleting ? "삭제 중..." : "동영상 삭제"}
                  </button>
                </div>
              </>
            ) : (
              <label
                className="ku-file-trigger ku-file-trigger--dropzone"
                data-disabled={busy}
              >
                <span style={{ fontSize: 28 }}>🎬</span>
                {phaseLabel ??
                  `동영상 추가 (mp4, webm, mov · 최대 ${MAX_VIDEO_LABEL})`}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleUpload}
                  disabled={busy}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          message="동영상을 삭제할까요?"
          description="삭제한 동영상은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          message="지금 나가면 처리가 중단됩니다."
          description="중단되면 처음부터 다시 해야 해요."
          confirmLabel="중단하고 나가기"
          onConfirm={handleForceClose}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}
