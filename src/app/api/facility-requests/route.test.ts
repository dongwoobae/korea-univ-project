import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const verifyTurnstile = vi.fn();
vi.mock("@/lib/server/turnstile", () => ({ verifyTurnstile }));

let buildingRow: unknown = { id: 1 };
let typeRow: unknown = { code: "elevator" };
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from, rpc }),
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://local.test/api/facility-requests", {
    method: "POST",
    headers: { "x-real-ip": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
}

const valid = {
  buildingId: 1,
  fields: {
    facility_code: "elevator",
    floor_info: "3층",
    lat: 37.5,
    lng: 127.03,
  },
  turnstileToken: "tok",
  website: "",
};

describe("POST /api/facility-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts");
    vi.stubEnv("FACILITY_REQUEST_HASH_SECRET", "hs");
    buildingRow = { id: 1 };
    typeRow = { code: "elevator" };
    // Task 8의 GET 테스트가 같은 대역의 구현을 바꾸므로 여기서 다시 정한다.
    from.mockImplementation((table: string) =>
      queryStub({
        data: table === "buildings" ? buildingRow : typeRow,
        error: null,
      }),
    );
    verifyTurnstile.mockResolvedValue(true);
    rpc.mockResolvedValue({
      data: "5b0c1d2e-0000-4000-8000-000000000001",
      error: null,
    });
  });

  it("검사를 통과하면 요청을 만들고 업로드 토큰을 준다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe("5b0c1d2e-0000-4000-8000-000000000001");
    expect(body.uploadToken.split(".")[0]).toBe(body.id);
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "1.2.3.4", "ts");
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_facility_request");
    expect(args.p_fields).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "3층",
    });
    expect(args.p_client_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honeypot이 채워지면 저장 없이 성공으로 답한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ ...valid, website: "http://spam" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Turnstile 실패는 400 turnstile", async () => {
    verifyTurnstile.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "turnstile" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["없는 건물", () => (buildingRow = null)],
    ["없는 유형", () => (typeRow = null)],
  ])("%s이면 400 invalid", async (_label, arrange) => {
    arrange();
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("삭제되지 않은 건물만 찾는다 — is_deleted가 null인 건물도 살아 있다", async () => {
    const { POST } = await import("./route");
    await POST(post(valid));
    const buildingQuery = from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    };
    expect(buildingQuery.calls).toContainEqual({
      method: "not",
      args: ["is_deleted", "is", true],
    });
  });

  it("필드·건물 id가 잘못되면 400 invalid", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ ...valid, buildingId: "1" }))).status).toBe(400);
    expect(
      (await POST(post({ ...valid, fields: { facility_code: "" } }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({ ...valid, fields: { facility_code: "elevator", lat: 37 } }),
        )
      ).status,
    ).toBe(400);
  });

  it("함수가 rate_limited면 429", async () => {
    rpc.mockResolvedValue({ data: "rate_limited", error: null });
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("함수가 오류를 내면 500 server이고 원인을 기록한다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server" });
    expect(logged).toHaveBeenCalledWith("[facility-requests] create failed", {
      code: "XX000",
      message: "boom",
    });
    logged.mockRestore();
  });

  it("비밀값이 없으면 503 unavailable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(503);
  });

  it("본문이 크면 413", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid, { "content-length": "20000" }));
    expect(response.status).toBe(413);
  });
});
