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

  it("?ъ쭊???놁쑝硫?R2 ?뺣━ ?놁씠 row留???젣?쒕떎", async () => {
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l1", photo_url: null });

    expect(authedFetch).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("landmarks");
    expect(eq).toHaveBeenCalledWith("id", "l1");
    expect(result).toBeNull();
  });

  it("?ъ쭊???덉쑝硫?R2瑜?癒쇱? ?뺣━????row瑜???젣?쒕떎", async () => {
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

  it("?ъ쭊 ?뺣━???ㅽ뙣?섎㈃ row瑜???젣?섏? ?딄퀬 硫붿떆吏瑜?諛섑솚?쒕떎", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({
      id: "l3",
      photo_url: "https://cdn.example.com/landmark-photos/l3/a.webp",
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("?ъ쭊 ??젣???ㅽ뙣??紐낆냼瑜?吏?곗? 紐삵뻽?댁슂");
  });

  it("row ??젣???ㅽ뙣?섎㈃ 硫붿떆吏瑜?諛섑솚?쒕떎", async () => {
    eq.mockResolvedValueOnce({ error: { message: "沅뚰븳 ?놁쓬" } });
    const { deleteLandmark } = await import("./landmarkDelete");

    const result = await deleteLandmark({ id: "l4", photo_url: null });

    expect(result).toBe("沅뚰븳 ?놁쓬");
  });
});
