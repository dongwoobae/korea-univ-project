import { describe, expect, it, vi } from "vitest";
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
  });
});
