import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const maybeSingle = vi.fn();
const query = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle,
  is: vi.fn(),
};
query.update.mockReturnValue(query);
query.eq.mockReturnValue(query);
query.select.mockReturnValue(query);
query.is.mockReturnValue(query);
const from = vi.fn(() => query);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  r2: { send },
  R2_BUCKET: "bucket",
  getR2KeyFromPublicUrl: (url: string) =>
    url.startsWith("https://cdn.test/")
      ? url.slice("https://cdn.test/".length)
      : null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const landmarkId = "11111111-1111-1111-1111-111111111111";
const photoUrl = "https://cdn.test/landmark-photos/1.webp";

function request() {
  return new Request("https://local.test/api/delete-landmark-photo", {
    method: "POST",
    body: JSON.stringify({ landmarkId, photoUrl }),
  });
}

describe("delete landmark photo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.is.mockReturnValue(query);
  });

  it("현재 사진이 바뀌었으면 객체를 삭제하지 않는다", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });

  it("현재 사진과 일치하면 연결 해제 후 객체를 삭제한다", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { id: landmarkId },
      error: null,
    });
    send.mockResolvedValueOnce({});
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("photo_url", photoUrl);
    expect(send).toHaveBeenCalledOnce();
  });
});
