import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const uploadPhoto = vi.fn();
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  uploadPhoto,
  removeObject,
}));

// 테이블마다 응답을 호출 순서대로 꺼낸다(facility_photos: 기존 목록 조회 → insert).
const queue: Record<string, unknown[]> = {};
const from = vi.fn((table: string) => queryStub(queue[table].shift()));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const FACILITY_ID = "11111111-1111-4111-8111-111111111111";

function webp(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

function post(
  bytes: Uint8Array<ArrayBuffer> = webp(),
  facilityId = FACILITY_ID,
  headers: Record<string, string> = {},
) {
  const form = new FormData();
  form.append("facilityId", facilityId);
  form.append("file", new Blob([bytes], { type: "image/webp" }), "p.webp");
  return new Request("https://local.test/api/upload-facility-photo", {
    method: "POST",
    body: form,
    headers,
  });
}

function arrange({
  facility = { data: { id: FACILITY_ID }, error: null } as unknown,
  existing = {
    data: [{ sort_order: 0 }, { sort_order: 2 }],
    error: null,
  } as unknown,
  insert = { data: { id: "fp1" }, error: null } as unknown,
} = {}) {
  queue.building_facilities = [facility];
  queue.facility_photos = [existing, insert];
}

describe("POST /api/upload-facility-photo", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    uploadPhoto.mockResolvedValue("f1/x.webp");
    removeObject.mockResolvedValue(true);
    arrange();
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("공개 버킷 시설 폴더에 올리고 비어 있는 가장 작은 순서로 행을 만든다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "fp1",
      storage_path: "f1/x.webp",
    });
    expect(uploadPhoto).toHaveBeenCalledWith(
      "facility-photos",
      FACILITY_ID,
      expect.any(Uint8Array),
    );
    const insertQuery = from.mock.results[2].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(insertQuery.calls[0]).toEqual({
      method: "insert",
      args: [
        { facility_id: FACILITY_ID, storage_path: "f1/x.webp", sort_order: 1 },
      ],
    });
  });

  it("이미 3장이면 409, 올리지 않는다", async () => {
    arrange({
      existing: {
        data: [{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }],
        error: null,
      },
    });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(409);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("동시에 올라와 순서가 겹치면(유일 제약) 올린 파일을 지우고 409", async () => {
    arrange({
      insert: { data: null, error: { code: "23505", message: "dup" } },
    });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(409);
    expect(removeObject).toHaveBeenCalledWith("facility-photos", "f1/x.webp");
  });

  it("행 저장이 다른 이유로 실패하면 파일을 지우고 500", async () => {
    arrange({
      insert: { data: null, error: { code: "XX000", message: "boom" } },
    });
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진을 저장하지 못했어요",
    });
    expect(removeObject).toHaveBeenCalledWith("facility-photos", "f1/x.webp");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("없는 시설은 404", async () => {
    arrange({ facility: { data: null, error: null } });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(404);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("시설 조회가 실패하면 404가 아니라 500, 올리지 않는다", async () => {
    arrange({ facility: { data: null, error: { message: "down" } } });
    const { POST } = await import("./route");
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "시설 정보를 불러오지 못했어요",
    });
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("기존 사진 조회가 실패하면 500, 올리지 않는다", async () => {
    arrange({ existing: { data: null, error: { message: "down" } } });
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(500);
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("uuid가 아닌 시설 ID는 조회 없이 404", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(webp(), "f1"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "시설이 없어요" });
    expect(from).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("WebP가 아니면 400, 조회·업로드하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(new Uint8Array(26)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "WebP 이미지만 올릴 수 있어요",
    });
    expect(from).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("content-length가 한도를 넘으면 본문을 읽기 전에 413", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(webp(), FACILITY_ID, { "content-length": String(10 * 1024 * 1024) }),
    );
    expect(response.status).toBe(413);
    expect(from).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});
