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

  it("사진이 있으면 동영상 다음에 사진을 하나씩 지운 뒤 row를 삭제한다", async () => {
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f5",
      video_url: null,
      facility_photos: [{ id: "fp1" }, { id: "fp2" }],
    });

    const paths = authedFetch.mock.calls.map((call) => call[0]);
    expect(paths.slice(0, 2)).toEqual([
      "/api/delete-facility-photo",
      "/api/delete-facility-photo",
    ]);
    expect(eq).toHaveBeenCalledWith("id", "f5");
    expect(result).toBeNull();
    authedFetch.mockReset();
  });

  it("사진 삭제가 실패하면 row를 지우지 않고 메시지를 돌려준다", async () => {
    authedFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f6",
      facility_photos: [{ id: "fp1" }],
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("사진 삭제에 실패해 시설을 지우지 못했어요");
  });
});
