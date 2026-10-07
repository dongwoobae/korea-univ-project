import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: "https://storage.test/building-photos/1/x.webp" },
}));
const single = vi.fn();
const insertQuery = { insert: vi.fn(), select: vi.fn(), single };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload, getPublicUrl }) },
    from: () => insertQuery,
  }),
}));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));

function webpBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

function request(bytes: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/webp" }), "photo.webp");
  form.append("buildingId", "1");
  return new Request("https://local.test/api/upload-building-photo", {
    method: "POST",
    body: form,
  });
}

describe("upload building photo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertQuery.insert.mockReturnValue(insertQuery);
    insertQuery.select.mockReturnValue(insertQuery);
    upload.mockResolvedValue({ error: null });
    single.mockResolvedValue({
      data: { id: 7, url: "https://storage.test/building-photos/1/x.webp" },
      error: null,
    });
  });

  it("이름표가 webp여도 내용이 PNG면 400으로 거절한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(pngBytes));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("잘린 WebP는 400으로 거절한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(webpBytes().slice(0, 20)));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("WebP는 image/webp와 1년 캐시로 저장한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(webpBytes()));

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/\d+-[a-z0-9]+\.webp$/),
      expect.anything(),
      { contentType: "image/webp", cacheControl: "31536000" },
    );
  });
});
