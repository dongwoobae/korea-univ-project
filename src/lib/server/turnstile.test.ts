import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("success가 true일 때만 통과한다", async () => {
    const ok = fakeFetch(Response.json({ success: true }));
    expect(await verifyTurnstile("tok", "1.1.1.1", "secret", ok)).toBe(true);
    const call = (ok as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    const body = call[1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.1.1.1");

    expect(
      await verifyTurnstile(
        "tok",
        null,
        "s",
        fakeFetch(Response.json({ success: false })),
      ),
    ).toBe(false);
  });

  it("빈 토큰·네트워크 오류·비정상 응답은 거부한다(닫힌 쪽으로 실패)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await verifyTurnstile(
        "",
        null,
        "s",
        fakeFetch(Response.json({ success: true })),
      ),
    ).toBe(false);
    expect(
      await verifyTurnstile("t", null, "s", fakeFetch(new Error("down"))),
    ).toBe(false);
    expect(
      await verifyTurnstile(
        "t",
        null,
        "s",
        fakeFetch(new Response("x", { status: 500 })),
      ),
    ).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("ip가 없으면 remoteip를 보내지 않는다", async () => {
    const f = fakeFetch(Response.json({ success: true }));
    await verifyTurnstile("tok", null, "s", f);
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect((call[1].body as URLSearchParams).has("remoteip")).toBe(false);
  });
});

describe("verifyTurnstile 로그", () => {
  afterEach(() => vi.restoreAllMocks());

  it("설정 오류 코드는 false를 돌려주고 로그를 남기되 토큰·비밀값은 싣지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeFetch(
      Response.json({
        success: false,
        "error-codes": ["invalid-input-secret"],
      }),
    );
    expect(await verifyTurnstile("tok-xyz", null, "sec-xyz", f)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/tok-xyz|sec-xyz/);
  });

  it("비정상 응답은 false를 돌려주고 로그를 남긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeFetch(new Response("x", { status: 500 }));
    expect(await verifyTurnstile("t", null, "s", f)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("호출 예외도 로그를 남긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await verifyTurnstile("t", null, "s", fakeFetch(new Error("down"))),
    ).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("사용자 쪽 실패는 로그를 남기지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeFetch(
      Response.json({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    );
    expect(await verifyTurnstile("t", null, "s", f)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
