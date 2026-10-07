import {
  MAX_VIDEO_LABEL,
  exceedsVideoLimit,
  formatExcessSize,
} from "@/lib/videoUpload";

export type UploadPhase =
  "loading" | "compressing" | "checking" | "preparing" | "uploading";

export interface PresignResult {
  presignedUrl: string;
  publicUrl: string;
  posterPresignedUrl: string | null;
  posterPublicUrl: string | null;
}

export interface FacilityVideoUploadDeps {
  compress: (
    file: File,
    onProgress: (progress: number) => void,
    onPhase: (phase: "loading" | "compressing") => void,
  ) => Promise<Blob>;
  isPlayable: (file: Blob) => Promise<boolean>;
  capturePoster: (video: Blob) => Promise<Blob | null>;
  presign: (request: {
    contentType: string;
    fileSize: number;
    posterSize?: number;
  }) => Promise<PresignResult>;
  put: (
    url: string,
    body: Blob,
    contentType: string,
    onProgress?: (progress: number) => void,
  ) => Promise<void>;
  confirm: (request: { videoUrl: string; posterUrl?: string }) => Promise<void>;
  isCancelled: () => boolean;
  onPhase: (phase: UploadPhase) => void;
  onProgress: (progress: number) => void;
}

export type FacilityVideoUploadResult =
  | { status: "uploaded"; videoUrl: string; usedOriginal: boolean }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

const CANCELLED = { status: "cancelled" } as const;

/** 순서와 예외 규칙: docs/specs/2026-10-07-sidepanel-media-loading-design.md 4.2–4.4 */
export async function uploadFacilityVideo(
  file: File,
  deps: FacilityVideoUploadDeps,
): Promise<FacilityVideoUploadResult> {
  let payload: Blob;
  let contentType: string;
  let usedOriginal = false;
  try {
    payload = await deps.compress(file, deps.onProgress, deps.onPhase);
    contentType = "video/mp4";
  } catch {
    if (deps.isCancelled()) return CANCELLED;
    deps.onPhase("checking");
    if (!(await deps.isPlayable(file))) {
      return {
        status: "failed",
        message:
          "이 영상은 브라우저에서 재생할 수 없고 변환도 실패했어요. H.264(mp4)로 저장해 다시 올려주세요",
      };
    }
    payload = file;
    contentType = file.type;
    usedOriginal = true;
  }
  if (deps.isCancelled()) return CANCELLED;

  if (exceedsVideoLimit(payload.size)) {
    return {
      status: "failed",
      message: `${usedOriginal ? "파일이" : "변환 결과가"} 너무 커요 (${formatExcessSize(payload.size)}) · 최대 ${MAX_VIDEO_LABEL}`,
    };
  }

  deps.onPhase("preparing");
  const poster = await deps.capturePoster(payload);
  if (deps.isCancelled()) return CANCELLED;

  try {
    const signed = await deps.presign({
      contentType,
      fileSize: payload.size,
      ...(poster ? { posterSize: poster.size } : {}),
    });
    if (deps.isCancelled()) return CANCELLED;

    deps.onPhase("uploading");
    deps.onProgress(0);
    await deps.put(signed.presignedUrl, payload, contentType, deps.onProgress);
    if (deps.isCancelled()) return CANCELLED;

    let posterUrl: string | undefined;
    if (poster && signed.posterPresignedUrl && signed.posterPublicUrl) {
      try {
        await deps.put(signed.posterPresignedUrl, poster, "image/jpeg");
        posterUrl = signed.posterPublicUrl;
      } catch {
        // 포스터 없이도 영상은 재생된다.
      }
      if (deps.isCancelled()) return CANCELLED;
    }

    await deps.confirm({
      videoUrl: signed.publicUrl,
      ...(posterUrl ? { posterUrl } : {}),
    });
    return { status: "uploaded", videoUrl: signed.publicUrl, usedOriginal };
  } catch (error) {
    if (deps.isCancelled()) return CANCELLED;
    return {
      status: "failed",
      message:
        error instanceof Error ? error.message : "네트워크 오류가 발생했어요",
    };
  }
}
