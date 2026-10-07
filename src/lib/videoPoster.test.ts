import { describe, expect, it, vi } from "vitest";
import { captureVideoPoster, posterSize } from "./videoPoster";

function createFakeVideo() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    preload: "",
    muted: false,
    src: "",
    duration: 10,
    currentTime: 0,
    videoWidth: 1920,
    videoHeight: 1080,
    addEventListener(type: string, fn: () => void) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    removeAttribute() {},
    load() {},
    emit(type: string) {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
}

function createFakeCanvas() {
  const drawImage = vi.fn();
  const toBlob = vi.fn((callback: (blob: Blob | null) => void) =>
    callback(new Blob(["jpg"], { type: "image/jpeg" })),
  );
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob,
    drawImage,
  };
}

function capture(
  video: ReturnType<typeof createFakeVideo>,
  canvas = createFakeCanvas(),
) {
  return {
    canvas,
    result: captureVideoPoster(new Blob(["v"], { type: "video/mp4" }), {
      createVideo: () => video as unknown as HTMLVideoElement,
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    }),
  };
}

describe("posterSize", () => {
  it.each([
    [1920, 1080, 640, 360],
    [1080, 1920, 360, 640],
    [320, 240, 320, 240],
  ])("%sx%s → %sx%s", (w, h, ew, eh) => {
    expect(posterSize(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("captureVideoPoster", () => {
  it("1초 지점으로 이동해 640px JPEG(0.8)를 만든다", async () => {
    const video = createFakeVideo();
    const { canvas, result } = capture(video);

    video.emit("loadedmetadata");
    expect(video.currentTime).toBe(1);
    video.emit("seeked");

    const blob = await result;
    expect(blob?.type).toBe("image/jpeg");
    expect([canvas.width, canvas.height]).toEqual([640, 360]);
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
  });

  it("디코드 오류면 null", async () => {
    const video = createFakeVideo();
    const { result } = capture(video);

    video.emit("error");

    await expect(result).resolves.toBeNull();
  });

  it("화면 크기가 0이면(디코드 불가 코덱) null", async () => {
    const video = createFakeVideo();
    video.videoWidth = 0;
    const { result } = capture(video);

    video.emit("loadedmetadata");
    video.emit("seeked");

    await expect(result).resolves.toBeNull();
  });
});
