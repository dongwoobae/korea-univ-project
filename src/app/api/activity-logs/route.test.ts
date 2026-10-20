import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const findListedAdmin = vi.fn();
vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));
let writeResult: unknown;
const from = vi.fn(() => queryStub(writeResult));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

const NOW = new Date("2026-10-19T09:00:00.000Z");

function report(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    client_event_id: "11111111-1111-4111-8111-111111111111",
    owner_user_id: "u1",
    occurred_at: "2026-10-19T08:30:00.000Z",
    level: "error",
    action: "facility_photo.upload",
    reason_code: "network",
    message: "시설 사진 업로드 실패: 네트워크 연결이 끊겨 서버에 닿지 못함",
    detail: { status: 0 },
    target_table: null,
    target_id: null,
    target_label: null,
    ...overrides,
  };
}

const post = (body: unknown) =>
  new Request("https://local.test/api/activity-logs", {
    method: "POST",
    body: JSON.stringify(body),
  });

function written(): Record<string, unknown>[] {
  const call = (
    from.mock.results[0].value as {
      calls: { method: string; args: unknown[] }[];
    }
  ).calls.find((entry) => entry.method === "upsert");
  return call?.args[0] as Record<string, unknown>[];
}

describe("POST /api/activity-logs", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    requireAdmin.mockResolvedValue({ user: { id: "u1" } });
    findListedAdmin.mockResolvedValue({ displayName: "관리자" });
    writeResult = { error: null };
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  it("토큰이 없으면 401", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post({ reports: [report()] }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("로그인했지만 admin_users에 없는 계정은 403", async () => {
    findListedAdmin.mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ reports: [report()] }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("행위자는 본문이 아니라 토큰에서 정하고 kind는 언제나 failure", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        reports: [
          report({ actor_label: "가짜", kind: "change", actor_id: "u9" }),
        ],
      }),
    );
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(written()[0]).toMatchObject({
      kind: "failure",
      actor_kind: "admin",
      actor_id: "u1",
      actor_label: "관리자",
      occurred_at: "2026-10-19T08:30:00.000Z",
      client_event_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("owner_user_id가 토큰 계정과 다른 항목은 버린다", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        reports: [
          report({ owner_user_id: "u2" }),
          report({
            client_event_id: "22222222-2222-4222-8222-222222222222",
          }),
        ],
      }),
    );
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(written()).toHaveLength(1);
  });

  it("허용 목록 밖 값이면 400", async () => {
    const { POST } = await import("./route");
    for (const bad of [
      report({ level: "info" }),
      report({ reason_code: "audit_write_failed" }),
      report({ action: "drop.table" }),
      report({ target_table: "auth_users" }),
      report({ client_event_id: "not-a-uuid" }),
    ]) {
      expect((await POST(post({ reports: [bad] }))).status).toBe(400);
    }
    expect((await POST(post({ reports: [] }))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("message·detail을 자르고 가린다", async () => {
    const { POST } = await import("./route");
    await POST(
      post({
        reports: [
          report({
            message: `Bearer secret ${"x".repeat(400)}`,
            detail: {
              status: 413,
              raw: { body: "x" },
              route: "/api/x?token=1",
            },
          }),
        ],
      }),
    );
    const row = written()[0];
    expect(row.message).toHaveLength(300);
    expect(String(row.message).startsWith("Bearer [가림]")).toBe(true);
    expect(row.detail).toEqual({ status: 413, route: "/api/x" });
  });

  it("미래이거나 30일보다 오래된 발생 시각은 받은 시각으로 바꾼다", async () => {
    const { POST } = await import("./route");
    await POST(
      post({
        reports: [
          report({ occurred_at: "2026-10-20T00:00:00.000Z" }),
          report({
            client_event_id: "33333333-3333-4333-8333-333333333333",
            occurred_at: "2026-09-01T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(written().map((row) => row.occurred_at)).toEqual([
      NOW.toISOString(),
      NOW.toISOString(),
    ]);
  });

  it("재전송은 client_event_id로 한 줄만 남긴다", async () => {
    const { POST } = await import("./route");
    await POST(post({ reports: [report()] }));
    const call = (
      from.mock.results[0].value as {
        calls: { method: string; args: unknown[] }[];
      }
    ).calls.find((entry) => entry.method === "upsert");
    expect(call?.args[1]).toEqual({
      onConflict: "client_event_id",
      ignoreDuplicates: true,
    });
  });
});
