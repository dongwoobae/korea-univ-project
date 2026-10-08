import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    authedFetch.mockReset();
  });

  it("동영상이 없으면 사진 폴더만 정리하고 row를 삭제한다", async () => {
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f1", video_url: null });

    const paths = authedFetch.mock.calls.map((call) => call[0]);
    expect(paths).toEqual([
      "/api/delete-facility-photos",
      "/api/revalidate-facilities",
    ]);
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({
      facilityId: "f1",
    });
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(result).toBeNull();
  });

  it("동영상 → 사진 폴더 → row 순서로 지운다", async () => {
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f2",
      video_url: "https://cdn.example.com/videos/f2.mp4",
    });

    const paths = authedFetch.mock.calls.map((call) => call[0]);
    expect(paths.slice(0, 2)).toEqual([
      "/api/delete-facility-video",
      "/api/delete-facility-photos",
    ]);
    expect(eq).toHaveBeenCalledWith("id", "f2");
    expect(result).toBeNull();
  });

  it("동영상 정리에 실패하면 사진·row를 지우지 않고 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f3",
      video_url: "https://cdn.example.com/videos/f3.mp4",
    });

    expect(authedFetch).toHaveBeenCalledTimes(1);
    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("동영상 삭제에 실패해 시설을 지우지 못했어요");
  });

  it("row 삭제에 실패하면 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    eq.mockResolvedValueOnce({ error: { message: "권한 없음" } });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f4", video_url: null });

    expect(result).toBe("권한 없음");
  });

  it("사진 정리에 실패하면 row를 지우지 않고 메시지를 돌려준다", async () => {
    authedFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f6" });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("사진 삭제에 실패해 시설을 지우지 못했어요");
  });
});
