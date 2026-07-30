import { afterEach, describe, expect, it, vi } from "vitest";
import { isVideoPlayable } from "./videoPlayback";

/**
 * 실제 <video>를 대신하는 최소 스텁. 테스트가 이벤트 발생 시점과
 * videoWidth를 직접 통제해 브라우저 상황(정상·HEVC·에러·무응답)을 재현한다.
 */
function createFakeVideo() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    preload: "",
    muted: false,
    src: "",
    videoWidth: 0,
    videoHeight: 0,
    removedSrc: false,
    addEventListener(type: string, fn: () => void) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    removeAttribute(name: string) {
      if (name === "src") this.removedSrc = true;
    },
    load() {},
    emit(type: string) {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
}

function probe(video: ReturnType<typeof createFakeVideo>) {
  return isVideoPlayable(new Blob(["video-bytes"], { type: "video/mp4" }), {
    createVideo: () => video as unknown as HTMLVideoElement,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isVideoPlayable", () => {
  it("비디오 트랙이 디코드되면(videoWidth > 0) true를 반환한다", async () => {
    const video = createFakeVideo();
    const result = probe(video);

    video.videoWidth = 1920;
    video.videoHeight = 1080;
    video.emit("loadedmetadata");

    await expect(result).resolves.toBe(true);
  });

  it("메타데이터는 로드되지만 videoWidth가 0이면 false를 반환한다(HEVC)", async () => {
    const video = createFakeVideo();
    const result = probe(video);

    // 아이폰 HEVC(hvc1): duration은 읽히지만 크기는 0으로 남는다
    video.emit("loadedmetadata");

    await expect(result).resolves.toBe(false);
  });

  it("error 이벤트가 발생하면 false를 반환한다", async () => {
    const video = createFakeVideo();
    const result = probe(video);

    video.emit("error");

    await expect(result).resolves.toBe(false);
  });

  it("응답이 없으면 타임아웃 후 false를 반환한다", async () => {
    vi.useFakeTimers();
    const video = createFakeVideo();
    const result = probe(video);

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toBe(false);
  });

  it("판별이 끝나면 objectURL과 src를 정리한다", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const video = createFakeVideo();
    const result = probe(video);

    video.videoWidth = 1280;
    video.emit("loadedmetadata");
    await result;

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(video.removedSrc).toBe(true);
  });
});
