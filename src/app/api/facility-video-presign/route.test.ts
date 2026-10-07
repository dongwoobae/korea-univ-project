import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PutObjectCommand } from "@aws-sdk/client-s3";

const getSignedUrl = vi.fn(
  async (_client: unknown, command: PutObjectCommand) =>
    `https://signed.test/${command.input.Key}`,
);

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  r2Presign: {},
  R2_BUCKET: "bucket",
  getPublicR2Url: (key: string) => `https://cdn.test/${key}`,
}));

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";

function request(body: Record<string, unknown>) {
  return new Request("https://local.test/api/facility-video-presign", {
    method: "POST",
    body: JSON.stringify({
      facilityId,
      contentType: "video/mp4",
      fileSize: 1000,
      ...body,
    }),
  });
}

describe("facility video presign route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posterSize가 없으면 포스터 필드는 null이다", async () => {
    const { POST } = await import("./route");

    const data = await (await POST(request({}))).json();

    expect(data.posterPresignedUrl).toBeNull();
    expect(data.posterPublicUrl).toBeNull();
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it("posterSize가 있으면 짝 키를 크기·image/jpeg로 서명한다", async () => {
    const { POST } = await import("./route");

    const data = await (await POST(request({ posterSize: 2048 }))).json();

    const videoKey = data.publicUrl.replace("https://cdn.test/", "");
    expect(data.posterPublicUrl).toBe(
      `https://cdn.test/${videoKey.replace(/\.mp4$/, ".jpg")}`,
    );
    const posterCommand = getSignedUrl.mock.calls[1][1];
    expect(posterCommand.input.ContentType).toBe("image/jpeg");
    expect(posterCommand.input.ContentLength).toBe(2048);
  });

  it.each([1024 * 1024 + 1, -1, "2048"])(
    "posterSize %s는 400으로 거절한다",
    async (posterSize) => {
      const { POST } = await import("./route");

      const response = await POST(request({ posterSize }));

      expect(response.status).toBe(400);
      expect(getSignedUrl).not.toHaveBeenCalled();
    },
  );
});
