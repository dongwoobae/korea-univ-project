import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signUploadToken } from "@/lib/server/requestSecurity";

const uploadPhoto = vi.fn();
const removeObject = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  uploadPhoto,
  removeObject,
}));

const rpc = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ rpc }),
}));

const ID = "5b0c1d2e-0000-4000-8000-000000000001";

function webp(size = 26): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

function post(
  id: string,
  token: string,
  bytes: Uint8Array<ArrayBuffer> = webp(),
) {
  const form = new FormData();
  form.append("token", token);
  form.append("file", new Blob([bytes], { type: "image/webp" }), "p.webp");
  return [
    new Request(`https://local.test/api/facility-requests/${id}/photos`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

describe("POST /api/facility-requests/[id]/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FACILITY_REQUEST_HASH_SECRET", "hs");
    uploadPhoto.mockResolvedValue(`${ID}/x.webp`);
    removeObject.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: "photo-1", error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const token = () => signUploadToken(ID, Date.now() + 60_000, "hs");

  it("토큰이 맞으면 비공개 버킷 요청 폴더에 올리고 함수로 행을 만든다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "photo-1" });
    expect(uploadPhoto).toHaveBeenCalledWith(
      "facility-request-photos",
      ID,
      expect.any(Uint8Array),
    );
    expect(rpc).toHaveBeenCalledWith("add_facility_request_photo", {
      p_request_id: ID,
      p_storage_path: `${ID}/x.webp`,
    });
  });

  it("다른 요청의 토큰·만료된 토큰은 403이고 올리지 않는다", async () => {
    const { POST } = await import("./route");
    const other = signUploadToken(
      "5b0c1d2e-0000-4000-8000-000000000009",
      Date.now() + 60_000,
      "hs",
    );
    const wrong = await POST(...post(ID, other));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "token" });
    expect(
      (await POST(...post(ID, signUploadToken(ID, Date.now() - 1, "hs"))))
        .status,
    ).toBe(403);
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("WebP가 아니면 400, 올리지 않는다", async () => {
    const { POST } = await import("./route");
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    const response = await POST(...post(ID, token(), png));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "not_webp" });
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("4MB를 넘으면 413", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      ...post(ID, token(), webp(4 * 1024 * 1024 + 1)),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it.each(["not_new", "full"])(
    "함수가 %s면 올린 파일을 지우고 409",
    async (code) => {
      rpc.mockResolvedValue({ data: code, error: null });
      const { POST } = await import("./route");
      const response = await POST(...post(ID, token()));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: code });
      expect(removeObject).toHaveBeenCalledWith(
        "facility-request-photos",
        `${ID}/x.webp`,
      );
    },
  );

  it("함수가 not_found면 올린 파일을 지우고 404", async () => {
    rpc.mockResolvedValue({ data: "not_found", error: null });
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(removeObject).toHaveBeenCalledWith(
      "facility-request-photos",
      `${ID}/x.webp`,
    );
  });

  it("함수가 실패하면 올린 파일을 지우고 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "db" } });
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server" });
    expect(removeObject).toHaveBeenCalledWith(
      "facility-request-photos",
      `${ID}/x.webp`,
    );
    expect(spy).toHaveBeenCalled();
  });

  it("저장소 업로드가 실패하면 500이고 함수를 부르지 않는다", async () => {
    uploadPhoto.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("비밀값이 없으면 503이고 올리지 않는다", async () => {
    vi.stubEnv("FACILITY_REQUEST_HASH_SECRET", "");
    const { POST } = await import("./route");
    const response = await POST(...post(ID, token()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("uuid가 아닌 id는 404", async () => {
    const { POST } = await import("./route");
    const response = await POST(...post("abc", token()));
    expect(response.status).toBe(404);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});
