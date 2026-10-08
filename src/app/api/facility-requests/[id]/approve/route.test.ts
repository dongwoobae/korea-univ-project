import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));

const copyToFacility = vi.fn();
const removeFolder = vi.fn();
const cleanupRequestPhotos = vi.fn();
vi.mock("@/lib/server/requestPhotoStorage", () => ({
  copyToFacility,
  removeFolder,
  cleanupRequestPhotos,
}));

const tables: Record<string, unknown> = {};
const errors: Record<string, unknown> = {};
const from = vi.fn((table: string) =>
  queryStub({ data: tables[table], error: errors[table] ?? null }),
);
const rpc = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from, rpc }),
}));

const ID = "r1";
const fields = {
  facility_code: "elevator",
  name: "후문 엘리베이터",
  floor_info: "3층",
  is_installed: true,
  lat: 37.5,
  lng: 127.0,
};
const call = (body: unknown) =>
  [
    new Request("https://local.test/x", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  ] as const;

describe("POST .../approve", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(errors)) delete errors[key];
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    tables.facility_types = { code: "elevator" };
    tables.facility_request_photos = [
      { id: "p1", storage_path: "r1/a.webp" },
      { id: "p2", storage_path: "r1/b.webp" },
    ];
    tables.facility_requests = { status: "new" };
    copyToFacility.mockImplementation(
      async (_path: string, facilityId: string) => `${facilityId}/copy.webp`,
    );
    removeFolder.mockResolvedValue(true);
    cleanupRequestPhotos.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: "approved", error: null });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("고른 사진만 시설 폴더로 복사하고 함수 하나로 승인한 뒤 요청 사진을 정리한다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p2"] }));
    expect(response.status).toBe(200);
    const { facilityId, cleanupFailed } = await response.json();
    expect(facilityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cleanupFailed).toBe(false);
    expect(copyToFacility).toHaveBeenCalledTimes(1);
    expect(copyToFacility).toHaveBeenCalledWith("r1/b.webp", facilityId);
    expect(rpc).toHaveBeenCalledWith("approve_facility_request", {
      p_request_id: ID,
      p_facility_id: facilityId,
      p_fields: { ...fields, description: null },
      p_photos: [
        {
          request_photo_id: "p2",
          storage_path: `${facilityId}/copy.webp`,
          sort_order: 0,
        },
      ],
    });
    expect(cleanupRequestPhotos).toHaveBeenCalledWith(ID);
    const photoQuery = from.mock.results.find(
      (_r, i) => from.mock.calls[i][0] === "facility_request_photos",
    )!.value as { calls: { method: string; args: unknown[] }[] };
    expect(photoQuery.calls).toContainEqual({
      method: "eq",
      args: ["request_id", ID],
    });
  });

  it("이 요청 것이 아닌 사진 id가 있으면 400이고 아무것도 복사하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p-other"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "이 요청의 사진이 아니에요",
    });
    expect(copyToFacility).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("둘째 장 복사가 실패하면 시설 폴더를 통째로 지우고 함수를 부르지 않는다", async () => {
    copyToFacility
      .mockImplementationOnce(
        async (_p: string, facilityId: string) => `${facilityId}/1.webp`,
      )
      .mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1", "p2"] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "사진을 옮기지 못했어요" });
    expect(rpc).not.toHaveBeenCalled();
    expect(removeFolder).toHaveBeenCalledWith(
      "facility-photos",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it("함수가 already_processed면 시설 폴더를 지우고 409", async () => {
    rpc.mockResolvedValue({ data: "already_processed", error: null });
    tables.facility_requests = { status: "rejected" };
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "이미 처리된 요청이에요" });
    expect(removeFolder).toHaveBeenCalledWith(
      "facility-photos",
      expect.any(String),
    );
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("함수가 photo_mismatch면 시설 폴더를 지우고 400", async () => {
    rpc.mockResolvedValue({ data: "photo_mismatch", error: null });
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "이 요청의 사진이 아니에요",
    });
    expect(removeFolder).toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
  });

  it("함수 호출이 오류면 시설 폴더를 지우고 500이며 요청 사진은 남긴다", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "boom", code: "XX000" },
    });
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "승인하지 못했어요" });
    expect(removeFolder).toHaveBeenCalled();
    expect(cleanupRequestPhotos).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("복사 중 다른 관리자가 거절했다면(원본 사라짐) 409로 답한다", async () => {
    copyToFacility.mockResolvedValue(null);
    tables.facility_requests = { status: "rejected" };
    const { POST } = await import("./route");
    expect((await POST(...call({ fields, photoIds: ["p1"] }))).status).toBe(
      409,
    );
  });

  it("정리가 실패해도 승인은 성공으로 답하고 알린다", async () => {
    cleanupRequestPhotos.mockResolvedValue(false);
    const { POST } = await import("./route");
    const body = await (await POST(...call({ fields, photoIds: [] }))).json();
    expect(body.cleanupFailed).toBe(true);
  });

  it("필드가 잘못됐거나 없는 유형이면 400", async () => {
    const { POST } = await import("./route");
    expect(
      (await POST(...call({ fields: { facility_code: "" }, photoIds: [] })))
        .status,
    ).toBe(400);
    tables.facility_types = null;
    expect((await POST(...call({ fields, photoIds: [] }))).status).toBe(400);
  });

  it("사진을 넷 이상 고르면 400", async () => {
    const { POST } = await import("./route");
    expect(
      (await POST(...call({ fields, photoIds: ["a", "b", "c", "d"] }))).status,
    ).toBe(400);
  });

  it("유형 조회가 실패하면 없는 유형이 아니라 500이다", async () => {
    errors.facility_types = { message: "down", code: "08006" };
    tables.facility_types = null;
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: [] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "시설 유형을 확인하지 못했어요",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("사진 조회가 실패하면 500이고 복사하지 않는다", async () => {
    errors.facility_request_photos = { message: "down", code: "08006" };
    tables.facility_request_photos = null;
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "사진을 불러오지 못했어요",
    });
    expect(copyToFacility).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("실패 뒤 상태 조회가 오류여도 원래 실패 응답을 낸다", async () => {
    copyToFacility.mockResolvedValue(null);
    errors.facility_requests = { message: "down", code: "08006" };
    tables.facility_requests = null;
    const { POST } = await import("./route");
    const response = await POST(...call({ fields, photoIds: ["p1"] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "사진을 옮기지 못했어요" });
    expect(removeFolder).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
