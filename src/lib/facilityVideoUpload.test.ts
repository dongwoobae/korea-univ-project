import { describe, expect, it, vi } from "vitest";
import {
  type FacilityVideoUploadDeps,
  uploadFacilityVideo,
} from "./facilityVideoUpload";
import { MAX_VIDEO_BYTES } from "./videoUpload";

const original = Object.assign(
  new Blob(["original-bytes"], { type: "video/quicktime" }),
  { name: "clip.mov" },
) as File;

function deps(
  overrides: Partial<FacilityVideoUploadDeps> = {},
): FacilityVideoUploadDeps {
  return {
    compress: vi.fn(async () => new Blob(["small"], { type: "video/mp4" })),
    isPlayable: vi.fn(async () => true),
    capturePoster: vi.fn(async () => new Blob(["jpg"], { type: "image/jpeg" })),
    presign: vi.fn(async () => ({
      presignedUrl: "https://upload.test/video",
      publicUrl: "https://cdn.test/v.mp4",
      posterPresignedUrl: "https://upload.test/poster",
      posterPublicUrl: "https://cdn.test/v.jpg",
    })),
    put: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    isCancelled: () => false,
    onPhase: vi.fn(),
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe("uploadFacilityVideo", () => {
  it("변환본과 포스터를 올리고 함께 확정한다", async () => {
    const d = deps();

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({
      status: "uploaded",
      videoUrl: "https://cdn.test/v.mp4",
      usedOriginal: false,
    });
    expect(d.presign).toHaveBeenCalledWith({
      contentType: "video/mp4",
      fileSize: 5,
      posterSize: 3,
    });
    expect(d.put).toHaveBeenCalledTimes(2);
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
      posterUrl: "https://cdn.test/v.jpg",
    });
    expect(d.isPlayable).not.toHaveBeenCalled();
  });

  it("변환이 실패해도 원본이 재생되면 원본을 올린다", async () => {
    const d = deps({ compress: vi.fn().mockRejectedValue(new Error("OOM")) });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toMatchObject({ status: "uploaded", usedOriginal: true });
    expect(d.presign).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "video/quicktime",
        fileSize: original.size,
      }),
    );
  });

  it("변환이 실패하고 원본도 재생되지 않으면 실패한다", async () => {
    const d = deps({
      compress: vi.fn().mockRejectedValue(new Error("OOM")),
      isPlayable: vi.fn(async () => false),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result.status).toBe("failed");
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("변환 중 취소로 실패하면 원본으로 넘어가지 않는다", async () => {
    let cancelled = false;
    const d = deps({
      compress: vi.fn(async () => {
        cancelled = true;
        throw new Error("called FFmpeg.terminate()");
      }),
      isCancelled: () => cancelled,
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "cancelled" });
    expect(d.isPlayable).not.toHaveBeenCalled();
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("presign 뒤에 취소되면 올리지 않는다", async () => {
    let cancelled = false;
    const d = deps({ isCancelled: () => cancelled });
    vi.mocked(d.presign).mockImplementationOnce(async () => {
      cancelled = true;
      return {
        presignedUrl: "u",
        publicUrl: "p",
        posterPresignedUrl: null,
        posterPublicUrl: null,
      };
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "cancelled" });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("포스터를 못 만들면 포스터 없이 올린다", async () => {
    const d = deps({ capturePoster: vi.fn(async () => null) });

    await uploadFacilityVideo(original, d);

    expect(d.presign).toHaveBeenCalledWith({
      contentType: "video/mp4",
      fileSize: 5,
    });
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
    });
  });

  it("포스터 PUT이 실패하면 posterUrl 없이 확정한다", async () => {
    const d = deps();
    vi.mocked(d.put)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("업로드 실패"));

    const result = await uploadFacilityVideo(original, d);

    expect(result.status).toBe("uploaded");
    expect(d.confirm).toHaveBeenCalledWith({
      videoUrl: "https://cdn.test/v.mp4",
    });
  });

  it("결과가 상한을 넘으면 올리지 않는다", async () => {
    const d = deps({
      compress: vi.fn(async () => ({ size: MAX_VIDEO_BYTES + 1 }) as Blob),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toMatchObject({ status: "failed" });
    expect((result as { message: string }).message).toContain("최대 500MB");
    expect(d.presign).not.toHaveBeenCalled();
  });

  it("확정이 실패하면 그 문장으로 실패한다", async () => {
    const d = deps({
      confirm: vi.fn().mockRejectedValue(new Error("저장 실패: db")),
    });

    const result = await uploadFacilityVideo(original, d);

    expect(result).toEqual({ status: "failed", message: "저장 실패: db" });
  });
});
