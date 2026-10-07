import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcodeArgs } from "./videoTranscode";

const instances: FakeFFmpeg[] = [];
let coreGate: Promise<void> = Promise.resolve();

class FakeFFmpeg {
  resolveLoad: () => void = () => {};
  rejectLoad: (error: Error) => void = () => {};
  load = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        this.resolveLoad = resolve;
        this.rejectLoad = reject;
      }),
  );
  terminate = vi.fn(() =>
    this.rejectLoad(new Error("called FFmpeg.terminate()")),
  );
  writeFile = vi.fn(async () => true);
  exec = vi.fn(async () => 0);
  readFile = vi.fn(async () => new Uint8Array([1, 2, 3]));
  deleteFile = vi.fn(async () => true);
  on = vi.fn();
  off = vi.fn();
  constructor() {
    instances.push(this);
  }
}

vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: FakeFFmpeg }));
vi.mock("@ffmpeg/util", () => ({
  toBlobURL: vi.fn(async () => {
    await coreGate;
    return "blob:core";
  }),
  fetchFile: vi.fn(async () => new Uint8Array([0])),
}));

const clip = () =>
  Object.assign(new Blob(["v"], { type: "video/quicktime" }), {
    name: "clip.mov",
  }) as File;

async function load() {
  vi.resetModules();
  return import("./compressVideo");
}

describe("compressVideo", () => {
  beforeEach(() => {
    instances.length = 0;
    coreGate = Promise.resolve();
  });

  it("코어를 받는 중에 종료하면 load로 넘어가지 않고 거절된다", async () => {
    const { compressVideo, terminateFFmpeg } = await load();
    let openGate = () => {};
    coreGate = new Promise((resolve) => (openGate = resolve));

    const result = compressVideo(clip());
    terminateFFmpeg();
    openGate();

    await expect(result).rejects.toThrow();
    expect(instances[0].load).not.toHaveBeenCalled();
  });

  it("불러오는 중에 종료하면 거절된다", async () => {
    const { compressVideo, terminateFFmpeg } = await load();

    const result = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    terminateFFmpeg();

    await expect(result).rejects.toThrow("terminate");
    expect(instances[0].terminate).toHaveBeenCalled();
  });

  it("공유 인자(ultrafast)로 변환하고 mp4 Blob을 돌려준다", async () => {
    const { compressVideo } = await load();

    const result = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    instances[0].resolveLoad();

    const blob = await result;
    expect(instances[0].exec).toHaveBeenCalledWith(
      transcodeArgs("input.mov", "output.mp4", "ultrafast"),
    );
    expect(blob.type).toBe("video/mp4");
  });

  it("변환이 실패하면 인스턴스를 버리고 다음 호출은 새로 만든다", async () => {
    const { compressVideo } = await load();
    const first = compressVideo(clip());
    await vi.waitFor(() => expect(instances[0].load).toHaveBeenCalled());
    instances[0].exec.mockRejectedValueOnce(new Error("OOM"));
    instances[0].resolveLoad();
    await expect(first).rejects.toThrow("OOM");
    expect(instances[0].terminate).toHaveBeenCalled();

    void compressVideo(clip()).catch(() => {});
    await vi.waitFor(() => expect(instances).toHaveLength(2));
  });
});
