import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const rowStubs: ReturnType<typeof queryStub>[] = [];
const from = vi.fn(() => {
  const stub = queryStub(deleteResult);
  rowStubs.push(stub);
  return stub;
});

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
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls.length = 0;
    rowStubs.length = 0;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteResult = { error: null };
    bucket.list.mockResolvedValue({
      data: [{ name: "a.webp" }, { name: "b.webp" }],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    bucket.upload.mockResolvedValue({ data: {}, error: null });
    bucket.copy.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("폴더 정리는 폴더 안 파일을 모두 지운다 — 행이 없는 파일도", async () => {
    const { removeFolder } = await import("./requestPhotoStorage");
    bucket.list
      .mockResolvedValueOnce({
        data: [{ name: "orphan.webp" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    expect(await removeFolder("facility-request-photos", "r1")).toBe(true);
    expect(bucket.list).toHaveBeenCalledWith("r1", { limit: 100 });
    expect(bucket.remove).toHaveBeenCalledWith(["r1/orphan.webp"]);
  });

  it("빈 폴더면 지울 것 없이 성공한다", async () => {
    bucket.list.mockResolvedValue({ data: [], error: null });
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-photos", "f1")).toBe(true);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("한 페이지가 가득 차면 다음 페이지까지 반복해 지운다", async () => {
    const { removeFolder } = await import("./requestPhotoStorage");
    const full = Array.from({ length: 100 }, (_, i) => ({ name: `${i}.webp` }));
    bucket.list
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: [{ name: "x.webp" }], error: null });
    expect(await removeFolder("facility-request-photos", "r1")).toBe(true);
    expect(bucket.remove).toHaveBeenCalledTimes(2);
    expect(bucket.remove).toHaveBeenLastCalledWith(["r1/x.webp"]);
  });

  it("나열이 실패하면 지우지 않고 false다", async () => {
    bucket.list.mockResolvedValue({ data: null, error: { message: "down" } });
    const { removeFolder } = await import("./requestPhotoStorage");
    expect(await removeFolder("facility-photos", "f1")).toBe(false);
    expect(bucket.remove).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("요청 사진 정리는 파일을 먼저 지우고 성공해야 행을 지운다", async () => {
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(true);
    expect(storageCalls).toEqual(["facility-request-photos"]);
    expect(from).toHaveBeenCalledWith("facility_request_photos");
    expect(rowStubs[0].calls).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["request_id", "r1"] },
    ]);

    vi.clearAllMocks();
    bucket.list.mockResolvedValue({ data: [{ name: "a.webp" }], error: null });
    bucket.remove.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await cleanupRequestPhotos("r1")).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("정리 순서는 폴더 나열, 파일 삭제, 행 삭제다", async () => {
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    bucket.list
      .mockResolvedValueOnce({ data: [{ name: "a.webp" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await cleanupRequestPhotos("r1");
    const listOrder = bucket.list.mock.invocationCallOrder[0];
    const removeOrder = bucket.remove.mock.invocationCallOrder[0];
    const rowOrder = from.mock.invocationCallOrder[0];
    expect(listOrder).toBeLessThan(removeOrder);
    expect(removeOrder).toBeLessThan(rowOrder);
  });

  it("두 번 불러도 같은 결과이고 두 번째는 지울 파일이 없다", async () => {
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    bucket.list
      .mockResolvedValueOnce({ data: [{ name: "a.webp" }], error: null })
      .mockResolvedValue({ data: [], error: null });
    expect(await cleanupRequestPhotos("r1")).toBe(true);
    expect(await cleanupRequestPhotos("r1")).toBe(true);
    expect(bucket.remove).toHaveBeenCalledTimes(1);
  });

  it("행 삭제가 실패하면 정리 실패다", async () => {
    deleteResult = { error: { message: "db" } };
    const { cleanupRequestPhotos } = await import("./requestPhotoStorage");
    expect(await cleanupRequestPhotos("r1")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("removeObject는 결과를 불리언으로 돌려준다", async () => {
    const { removeObject } = await import("./requestPhotoStorage");
    expect(await removeObject("facility-photos", "f1/a.webp")).toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith(["f1/a.webp"]);
    bucket.remove.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await removeObject("facility-photos", "f1/a.webp")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
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

  it("업로드 실패는 null이다", async () => {
    bucket.upload.mockResolvedValue({ data: null, error: { message: "x" } });
    const { uploadPhoto } = await import("./requestPhotoStorage");
    expect(
      await uploadPhoto("facility-photos", "f1", new Uint8Array([1])),
    ).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
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
    expect(errorSpy).toHaveBeenCalled();
  });

  it("서명 URL은 경로별로 묶고 URL이 없는 항목은 뺀다", async () => {
    const { signedUrls } = await import("./requestPhotoStorage");
    expect((await signedUrls([])).size).toBe(0);
    bucket.createSignedUrls.mockResolvedValue({
      data: [
        { path: "r1/a.webp", signedUrl: "https://u/a", error: null },
        { path: "r1/b.webp", signedUrl: null, error: "nf" },
      ],
      error: null,
    });
    const map = await signedUrls(["r1/a.webp", "r1/b.webp"]);
    expect([...map]).toEqual([["r1/a.webp", "https://u/a"]]);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(
      ["r1/a.webp", "r1/b.webp"],
      600,
    );
  });
});
