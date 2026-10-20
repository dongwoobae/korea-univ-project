import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));
const findListedAdmin = vi.fn();
vi.mock("@/lib/server/adminUsers", () => ({ findListedAdmin }));

const admin = {
  kind: "admin",
  user: { id: "u1", email: "admin@example.com" },
} as const;

describe("logFailure", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    findListedAdmin.mockResolvedValue({ displayName: "관리자" });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("기록을 after에 맡기고 기다리지 않는다", async () => {
    const { logFailure } = await import("./activityLog");
    logFailure({
      route: "/api/delete-facility-photo",
      action: "facility_photo.delete",
      actor: admin,
      reason: "storage_error",
      status: 500,
      error: { message: "denied" },
      target: { table: "facility_photos", id: "p1" },
    });
    expect(insert).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(from).toHaveBeenCalledWith("activity_logs");
    expect(insert).toHaveBeenCalledWith({
      level: "error",
      kind: "failure",
      actor_kind: "admin",
      actor_id: "u1",
      actor_label: "관리자",
      action: "facility_photo.delete",
      target_table: "facility_photos",
      target_id: "p1",
      target_label: null,
      reason_code: "storage_error",
      message: "시설 사진 삭제 실패: 파일 저장소가 거부함: denied",
      detail: {
        status: 500,
        error_message: "denied",
        route: "/api/delete-facility-photo",
      },
    });
  });

  it("목록에 없는 관리자는 미등록 계정(이메일)로 남긴다", async () => {
    findListedAdmin.mockResolvedValue(null);
    const { writeFailure } = await import("./activityLog");
    await writeFailure({
      route: "/api/x",
      action: "facility_photo.upload",
      actor: admin,
      reason: "invalid_input",
    });
    expect(insert.mock.calls[0][0].actor_label).toBe(
      "미등록 계정(admin@example.com)",
    );
  });

  it("방문자와 시스템 행위자, 뒤따르는 일의 실패는 warning", async () => {
    const { writeFailure } = await import("./activityLog");
    await writeFailure({
      route: "/api/translate-facility",
      action: "facility.translate",
      actor: { kind: "system", system: "translation" },
      reason: "translation_error",
      followUp: true,
    });
    await writeFailure({
      route: "/api/feedback",
      action: "feedback.submit",
      actor: { kind: "visitor" },
      reason: "server_error",
    });
    expect(insert.mock.calls[0][0]).toMatchObject({
      level: "warning",
      actor_kind: "system",
      actor_label: "자동 번역",
      message: "자동 번역 실패: 번역 API 오류",
    });
    expect(insert.mock.calls[1][0]).toMatchObject({
      level: "error",
      actor_kind: "visitor",
      actor_id: null,
      actor_label: "방문자",
    });
  });

  it("insert가 실패해도 던지지 않고 console.error로 남긴다", async () => {
    insert.mockResolvedValue({ error: { message: "db down" } });
    const { writeFailure } = await import("./activityLog");
    await expect(
      writeFailure({
        route: "/api/x",
        action: "facility_photo.upload",
        actor: admin,
        reason: "server_error",
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[activity-log] failure log write failed",
      expect.objectContaining({ message: "db down" }),
    );
  });

  it("after를 못 쓰면 바로 쓴다", async () => {
    after.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    const { logFailure } = await import("./activityLog");
    logFailure({
      route: "/api/x",
      action: "facility_photo.upload",
      actor: { kind: "visitor" },
      reason: "server_error",
    });
    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
  });
});
