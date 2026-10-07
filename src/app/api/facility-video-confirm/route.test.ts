import { beforeEach, describe, expect, it, vi } from "vitest";

const query = { update: vi.fn(), eq: vi.fn() };
query.update.mockReturnValue(query);
const from = vi.fn(() => query);

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));
vi.mock("@/lib/r2", () => ({
  getR2KeyFromPublicUrl: (url: string) =>
    url.startsWith("https://cdn.test/")
      ? url.slice("https://cdn.test/".length)
      : null,
}));

const facilityId = "efca8dfa-c6c2-47c8-b2b0-923cfb98fe5f";
const videoUrl = `https://cdn.test/facility-videos/${facilityId}/100.mp4`;

function request(posterUrl?: string) {
  return new Request("https://local.test/api/facility-video-confirm", {
    method: "POST",
    body: JSON.stringify({ facilityId, videoUrl, posterUrl }),
  });
}

describe("facility video confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.update.mockReturnValue(query);
    query.eq.mockResolvedValue({ error: null });
  });

  it("posterUrl이 없으면 video_poster_url을 null로 덮는다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({
      video_url: videoUrl,
      video_poster_url: null,
    });
  });

  it("짝 포스터는 함께 저장한다", async () => {
    const { POST } = await import("./route");
    const posterUrl = `https://cdn.test/facility-videos/${facilityId}/100.jpg`;

    await POST(request(posterUrl));

    expect(query.update).toHaveBeenCalledWith({
      video_url: videoUrl,
      video_poster_url: posterUrl,
    });
  });

  it.each([
    `https://cdn.test/facility-videos/${facilityId}/101.jpg`,
    `https://cdn.test/facility-videos/other/100.jpg`,
    "https://elsewhere.test/poster.jpg",
  ])("짝이 아닌 posterUrl %s는 400이다", async (posterUrl) => {
    const { POST } = await import("./route");

    const response = await POST(request(posterUrl));

    expect(response.status).toBe(400);
    expect(query.update).not.toHaveBeenCalled();
  });
});
