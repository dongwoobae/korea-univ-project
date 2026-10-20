import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession },
  },
}));
const reportApiOutcome = vi.fn();
vi.mock("@/lib/activityReport", () => ({ reportApiOutcome }));

describe("authedFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(new Response("{}"));
  });

  it("adds Authorization when a session access token exists", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-1" } },
    });
    const { authedFetch } = await import("./authedFetch");

    await authedFetch("/api/translate", { method: "POST" });

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer token-1",
    );
  });

  it("does not set Content-Type for FormData uploads", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-1" } },
    });
    const { authedFetch } = await import("./authedFetch");

    await authedFetch("/api/upload-building-photo", {
      method: "POST",
      body: new FormData(),
    });

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
  });

  it("preserves existing headers", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-1" } },
    });
    const { authedFetch } = await import("./authedFetch");

    await authedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": "abc" },
    });

    const headers = new Headers(
      vi.mocked(global.fetch).mock.calls[0][1]?.headers,
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toBe("abc");
    expect(headers.get("Authorization")).toBe("Bearer token-1");
  });

  it("응답을 관문 보고에 넘긴다", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    const response = new Response("{}");
    vi.mocked(global.fetch).mockResolvedValueOnce(response);
    const { authedFetch } = await import("./authedFetch");

    await authedFetch("/api/upload-facility-photo", { method: "POST" });

    expect(reportApiOutcome).toHaveBeenCalledWith(
      "/api/upload-facility-photo",
      expect.objectContaining({ method: "POST" }),
      response,
    );
  });

  it("fetch가 던지면 관문 보고에 넘기고 다시 던진다", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    const error = new TypeError("Failed to fetch");
    vi.mocked(global.fetch).mockRejectedValueOnce(error);
    const { authedFetch } = await import("./authedFetch");

    await expect(
      authedFetch("/api/upload-facility-photo", { method: "POST" }),
    ).rejects.toBe(error);
    expect(reportApiOutcome).toHaveBeenCalledWith(
      "/api/upload-facility-photo",
      expect.objectContaining({ method: "POST" }),
      error,
    );
  });
});
