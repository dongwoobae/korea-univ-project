import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
let saveResult: unknown;
const from = vi.fn(() => queryStub(saveResult));
const supabaseAdmin = vi.fn(() => ({ from }));
vi.mock("@/lib/server/supabaseAdmin", () => ({ supabaseAdmin }));

const post = (body: unknown) =>
  new Request("https://local.test/api/settings/feedback-emails", {
    method: "POST",
    body: JSON.stringify(body),
  });

const valid = {
  to: "help@example.com",
  cc: ["cc@example.com"],
  subject: "[지도] 의견",
};

describe("POST /api/settings/feedback-emails", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      user: { id: "admin", email: "admin@example.com" },
      admin: { displayName: "관리자" },
    });
    saveResult = { error: null };
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("토큰이 없으면 requireAdmin의 401을 돌려준다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({ error: "인증 필요" }, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자 목록에 없으면 requireAdmin의 403을 돌려준다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json(
        { error: "관리자 목록에 없는 계정이에요" },
        { status: 403 },
      ),
    });
    const { POST } = await import("./route");
    expect((await POST(post(valid))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자를 행위자로 실어 저장하고 공개 지도를 갱신한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: valid });
    expect(supabaseAdmin).toHaveBeenCalledWith({ userId: "admin" });
    const upsert = (
      from.mock.results[0].value as {
        calls: { method: string; args: unknown[] }[];
      }
    ).calls.find((call) => call.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({
      key: "feedback_emails",
      value: valid,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(logFailure).not.toHaveBeenCalled();
  });

  it("형식이 틀리면 400과 입력 오류 기록", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ ...valid, to: "nope" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "수신 이메일 형식 오류" });
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.feedback_emails",
        reason: "invalid_input",
        status: 400,
      }),
    );
  });

  it("저장이 실패하면 500과 서버 오류 기록", async () => {
    saveResult = { error: { code: "XX000", message: "db down" } };
    const { POST } = await import("./route");
    const response = await POST(post(valid));
    expect(response.status).toBe(500);
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "server_error", status: 500 }),
    );
  });

  it("참조 주소가 틀리면 주소를 뺀 사유로 기록한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ ...valid, cc: ["bad@address"] }));
    expect(await response.json()).toEqual({
      error: "참조 이메일 형식 오류: bad@address",
    });
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reasonText: "참조 이메일 형식 오류" }),
    );
  });
});
