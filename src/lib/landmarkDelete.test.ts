import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: del }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));

describe("deleteLandmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
  });

  it("사진이 없으면 R2 정리 없이 row만 삭제한다", async () => {
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l1", photo_url: null });

    expect(authedFetch).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("landmarks");
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(result).toBeNull();
  });

  it("사진이 있으면 R2를 먼저 정리한 뒤 row를 삭제한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: true });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({
      id: "l2",
      photo_url: "https://cdn.example.com/landmark-photos/l2/a.webp",
    });

    expect(authedFetch).toHaveBeenCalledWith(
      "/api/delete-landmark-photo",
      expect.objectContaining({ method: "POST" }),
    );
    expect(eq).toHaveBeenCalledWith("id", "l2");
    expect(result).toBeNull();
  });

  it("사진 정리에 실패하면 row를 삭제하지 않고 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({
      id: "l3",
      photo_url: "https://cdn.example.com/landmark-photos/l3/a.webp",
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("사진 삭제에 실패해 명소를 지우지 못했어요");
  });

  it("row 삭제에 실패하면 메시지를 반환한다", async () => {
    eq.mockResolvedValueOnce({ error: { message: "권한 없음" } });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l4", photo_url: null });

    expect(result).toBe("권한 없음");
  });
});
