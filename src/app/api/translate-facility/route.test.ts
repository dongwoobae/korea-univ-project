import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const translateKoTexts = vi.fn();
vi.mock("@/lib/server/googleTranslate", () => ({ translateKoTexts }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const after = vi.fn();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));

const FACILITY_ID = "11111111-1111-4111-8111-111111111111";
const source = {
  id: FACILITY_ID,
  name: "엘리베이터",
  description: null,
  floor_info: "1층",
};
let lookup: unknown;
let write: unknown;
// 첫 호출은 원문 조회, 두 번째는 번역 저장.
const from = vi.fn(() =>
  queryStub(from.mock.calls.length === 1 ? lookup : write),
);
const writeCalls = () =>
  (
    from.mock.results[1].value as {
      calls: { method: string; args: unknown[] }[];
    }
  ).calls;
const supabaseAdmin = vi.fn(() => ({ from }));
vi.mock("@/lib/server/supabaseAdmin", () => ({ supabaseAdmin }));

const post = (facilityId: unknown = FACILITY_ID) =>
  new Request("https://local.test/api/translate-facility", {
    method: "POST",
    body: JSON.stringify({ facilityId }),
  });

describe("POST /api/translate-facility", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    lookup = { data: source, error: null };
    write = { data: [{ id: FACILITY_ID }], error: null };
    translateKoTexts.mockResolvedValue({
      en: { name: "Elevator", floor_info: "Floor 1" },
      zh: { name: "电梯", floor_info: "1楼" },
    });
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("DB의 원문을 번역해 여섯 칸과 translated를 저장하고 재검증한다", async () => {
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(logFailure).not.toHaveBeenCalled();
    expect(supabaseAdmin).toHaveBeenCalledWith({ system: "translation" });
    expect(await response.json()).toEqual({ status: "translated" });
    expect(translateKoTexts).toHaveBeenCalledWith({
      name: "엘리베이터",
      floor_info: "1층",
    });
    expect(writeCalls()).toContainEqual({
      method: "update",
      args: [
        {
          name_en: "Elevator",
          name_zh: "电梯",
          description_en: null,
          description_zh: null,
          floor_info_en: "Floor 1",
          floor_info_zh: "1楼",
          translation_status: "translated",
        },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/api/facilities");
  });

  it("읽은 원문이 그대로일 때만 쓰도록 원문 세 칸을 조건으로 건다", async () => {
    const { POST } = await import("./route");

    await POST(post());

    expect(writeCalls()).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", FACILITY_ID] },
        { method: "eq", args: ["name", "엘리베이터"] },
        { method: "is", args: ["description", null] },
        { method: "eq", args: ["floor_info", "1층"] },
      ]),
    );
  });

  it("그 사이 원문이 바뀌어 0행이면 superseded로 끝내고 재검증하지 않는다", async () => {
    write = { data: [], error: null };
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "superseded" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("번역에 실패하면 failed만 저장하고 502", async () => {
    translateKoTexts.mockRejectedValue(new Error("quota"));
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(502);
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "facility.translate",
        actor: { kind: "system", system: "translation" },
        reason: "translation_error",
        status: 502,
        followUp: true,
      }),
    );
    expect(writeCalls()).toContainEqual({
      method: "update",
      args: [{ translation_status: "failed" }],
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("저장이 실패하면 500", async () => {
    write = { data: null, error: { message: "down" } };
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("관리자가 떠나도 끝까지 처리되도록 작업을 after에 맡긴다", async () => {
    let finish: (value: unknown) => void = () => {};
    translateKoTexts.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { POST } = await import("./route");

    const pending = POST(post());
    await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
    const background = (after.mock.calls[0][0] as () => Promise<unknown>)();
    finish({ en: {}, zh: {} });
    await background;

    expect(from).toHaveBeenCalledTimes(2);
    await pending;
  });

  it("없는 시설은 번역하지 않고 404", async () => {
    lookup = { data: null, error: null };
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(404);
    expect(translateKoTexts).not.toHaveBeenCalled();
  });

  it("uuid가 아닌 ID는 조회 없이 404", async () => {
    const { POST } = await import("./route");

    const response = await POST(post("f1"));

    expect(response.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
});
