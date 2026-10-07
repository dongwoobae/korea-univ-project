import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const maybeSingle = vi.fn();
const query = {
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle,
};
const from = vi.fn(() => query);

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));
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

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";
const videoUrl = `https://cdn.test/facility-videos/${facilityId}/100.mp4`;
const posterUrl = `https://cdn.test/facility-videos/${facilityId}/100.jpg`;

function request() {
  return new Request("https://local.test/api/delete-facility-video", {
    method: "POST",
    body: JSON.stringify({ facilityId, videoUrl }),
  });
}

function deletedKeys() {
  return send.mock.calls.map(([command]) => command.input.Key);
}

describe("delete facility video route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [query.select, query.update, query.eq, query.is])
      fn.mockReturnValue(query);
    maybeSingle
      .mockResolvedValueOnce({
        data: { video_url: videoUrl, video_poster_url: posterUrl },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: facilityId }, error: null });
  });

  it("영상을 먼저, 포스터를 나중에 지운다", async () => {
    send.mockResolvedValue({});
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({
      video_url: null,
      video_poster_url: null,
    });
    expect(deletedKeys()).toEqual([
      `facility-videos/${facilityId}/100.mp4`,
      `facility-videos/${facilityId}/100.jpg`,
    ]);
  });

  it("영상 삭제가 실패하면 두 컬럼을 되돌리고 포스터는 지우지 않는다", async () => {
    send.mockRejectedValueOnce(new Error("R2 down"));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(deletedKeys()).toHaveLength(1);
    expect(query.update).toHaveBeenLastCalledWith({
      video_url: videoUrl,
      video_poster_url: posterUrl,
    });
  });

  it("포스터 삭제만 실패하면 성공으로 응답하고 되돌리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("R2 down"));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("포스터가 없으면 영상만 지운다", async () => {
    maybeSingle.mockReset();
    maybeSingle
      .mockResolvedValueOnce({
        data: { video_url: videoUrl, video_poster_url: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: facilityId }, error: null });
    send.mockResolvedValue({});
    const { POST } = await import("./route");

    await POST(request());

    expect(deletedKeys()).toEqual([`facility-videos/${facilityId}/100.mp4`]);
  });
});
