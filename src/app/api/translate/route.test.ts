import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }),
}));

const fetchMock = vi.fn();

function post(texts: Record<string, string>) {
  return new Request("https://local.test/api/translate", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
}

function translated(...texts: string[]) {
  return Response.json({
    data: { translations: texts.map((translatedText) => ({ translatedText })) },
  });
}

function sentBody(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("POST /api/translate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "gk");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("원문을 언어마다 한 번에 보내고 키별로 돌려준다", async () => {
    fetchMock.mockImplementation(async (_url, init: RequestInit) =>
      JSON.parse(init.body as string).target === "en"
        ? translated("Elevator", "Floor 1")
        : translated("电梯", "1楼"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      post({ name: "엘리베이터", description: "  ", floor_info: "1층" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      en: { name: "Elevator", floor_info: "Floor 1" },
      zh: { name: "电梯", floor_info: "1楼" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://translation.googleapis.com/language/translate/v2",
    );
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("gk");
    expect(fetchMock.mock.calls.map(sentBody)).toEqual(
      expect.arrayContaining([
        {
          q: ["엘리베이터", "1층"],
          source: "ko",
          target: "en",
          format: "text",
        },
        {
          q: ["엘리베이터", "1층"],
          source: "ko",
          target: "zh-CN",
          format: "text",
        },
      ]),
    );
  });

  it("번역 API가 거절하면 원문을 번역문처럼 돌려주지 않고 502로 실패한다", async () => {
    fetchMock.mockImplementation(
      async () => new Response("quota", { status: 403 }),
    );
    const { POST } = await import("./route");

    const response = await POST(post({ name: "엘리베이터" }));

    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("en");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("번역 개수가 원문과 다르면 502로 실패한다", async () => {
    fetchMock.mockImplementation(async () => translated("Elevator"));
    const { POST } = await import("./route");

    const response = await POST(
      post({ name: "엘리베이터", floor_info: "1층" }),
    );

    expect(response.status).toBe(502);
  });

  it("키가 없으면 번역 API를 부르지 않고 503으로 실패한다", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    const { POST } = await import("./route");

    const response = await POST(post({ name: "엘리베이터" }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("번역할 글이 없으면 번역 API를 부르지 않는다", async () => {
    const { POST } = await import("./route");

    const response = await POST(post({ name: " " }));

    expect(await response.json()).toEqual({ en: {}, zh: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
