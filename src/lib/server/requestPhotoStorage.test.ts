import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const storageCalls: string[] = [];
const bucket = {
  list: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  copy: vi.fn(),
  createSignedUrls: vi.fn(),
};
let deleteResult = { error: null as unknown };
const from = vi.fn(() => queryStub(deleteResult));

vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: () => ({
    storage: {
      from: (name: string) => {
        storageCalls.push(name);
        return bucket;
      },
    },
    from,
  }),
}));

describe("requestPhotoStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls.length = 0;
    deleteResult = { error: null };
    bucket.list.mockResolvedValue({
      data: [{ name: "a.webp" }, { name: "b.webp" }],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    bucket.upload.mockResolvedValue({ data: {}, error: null });
    bucket.copy.mockResolvedValue({ data: {}, error: null });
  });

  it("폴더 정리는 폴더 안 파일을 모두 지운다 — 행이 없는 파일도", async () => {
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-request-photos", "r1")).toBe(true);
    expect(bucket.list).toHaveBeenCalledWith("r1", { limit: 100 });
    expect(bucket.remove).toHaveBeenCalledWith(["r1/a.webp", "r1/b.webp"]);
  });

  it("빈 폴더면 지울 것 없이 성공한다", async () => {
    bucket.list.mockResolvedValue({ data: [], error: null });
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-photos", "f1")).toBe(true);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("요청 사진 정리는 파일을 먼저 지우고 성공해야 행을 지운다", async () => {
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(true);
    expect(storageCalls).toEqual(["facility-request-photos"]);
    expect(from).toHaveBeenCalledWith("facility_request_photos");

    vi.clearAllMocks();
    bucket.list.mockResolvedValue({ data: [{ name: "a.webp" }], error: null });
    bucket.remove.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await cleanupRequestPhotos("r1")).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("행 삭제가 실패하면 정리 실패다", async () => {
    deleteResult = { error: { message: "db" } };
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(false);
  });

  it("업로드는 id 폴더 아래 uuid 이름의 webp로, 1년 캐시로 올린다", async () => {
    const { uploadPhoto } = await import("./requestPhotoStorage");
    const path = await uploadPhoto(
      "facility-request-photos",
      "r1",
      new Uint8Array([1]),
    );
    expect(path).toMatch(/^r1\/[0-9a-f-]{36}\.webp$/);
    expect(bucket.upload).toHaveBeenCalledWith(path, expect.any(Uint8Array), {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
  });

  it("복사는 공개 버킷의 시설 폴더로 간다", async () => {
    const { copyToFacility } = await import("./requestPhotoStorage");
    const destination = await copyToFacility("r1/a.webp", "f1");
    expect(destination).toMatch(/^f1\/[0-9a-f-]{36}\.webp$/);
    expect(bucket.copy).toHaveBeenCalledWith("r1/a.webp", destination, {
      destinationBucket: "facility-photos",
    });
    bucket.copy.mockResolvedValue({
      data: null,
      error: { message: "missing" },
    });
    expect(await copyToFacility("r1/a.webp", "f1")).toBeNull();
  });
});
