import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: del }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));

describe("deleteFacility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
  });

  it("동영상이 없으면 R2 정리 없이 row만 삭제한다", async () => {
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f1", video_url: null });

    expect(authedFetch).toHaveBeenCalledTimes(1);
    expect(authedFetch).toHaveBeenCalledWith("/api/revalidate-facilities", {
      method: "POST",
    });
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(result).toBeNull();
  });

  it("동영상이 있으면 R2를 먼저 정리한 뒤 row를 삭제한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: true });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f2",
      video_url: "https://cdn.example.com/videos/f2.mp4",
    });

    expect(authedFetch).toHaveBeenCalledWith(
      "/api/delete-facility-video",
      expect.objectContaining({ method: "POST" }),
    );
    expect(eq).toHaveBeenCalledWith("id", "f2");
    expect(result).toBeNull();
  });

  it("동영상 정리에 실패하면 row를 삭제하지 않고 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f3",
      video_url: "https://cdn.example.com/videos/f3.mp4",
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("동영상 삭제에 실패해 시설을 지우지 못했어요");
  });

  it("row 삭제에 실패하면 메시지를 반환한다", async () => {
    eq.mockResolvedValueOnce({ error: { message: "권한 없음" } });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f4", video_url: null });

    expect(result).toBe("권한 없음");
  });
});
