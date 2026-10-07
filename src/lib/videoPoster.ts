import { POSTER_MAX_EDGE, posterSeekTime } from "@/lib/videoTranscode";

const POSTER_QUALITY = 0.8;
const POSTER_TIMEOUT_MS = 15_000;

type PosterOptions = {
  createVideo?: () => HTMLVideoElement;
  createCanvas?: () => HTMLCanvasElement;
  timeoutMs?: number;
};

export function posterSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function captureVideoPoster(
  file: Blob,
  {
    createVideo,
    createCanvas,
    timeoutMs = POSTER_TIMEOUT_MS,
  }: PosterOptions = {},
): Promise<Blob | null> {
  const video = createVideo ? createVideo() : document.createElement("video");
  const url = URL.createObjectURL(file);

  return new Promise<Blob | null>((resolve) => {
    let settled = false;

    const finish = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(poster);
    };

    const onMetadata = () => {
      video.currentTime = posterSeekTime(video.duration);
    };
    const onSeeked = () => {
      if (!video.videoWidth || !video.videoHeight) return finish(null);
      const size = posterSize(video.videoWidth, video.videoHeight);
      const canvas = createCanvas
        ? createCanvas()
        : document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return finish(null);
      context.drawImage(video, 0, 0, size.width, size.height);
      canvas.toBlob(finish, "image/jpeg", POSTER_QUALITY);
    };
    const onError = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);

    video.preload = "auto";
    video.muted = true;
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}
