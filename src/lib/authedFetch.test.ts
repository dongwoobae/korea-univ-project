import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession },
  },
}));

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
});
