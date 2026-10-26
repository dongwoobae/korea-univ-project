import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub, type QueryCall } from "@/test/queryStub";

const mocks = vi.hoisted(() => ({ from: vi.fn(), authedFetch: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch: mocks.authedFetch }));

const {
  TYPE_WRITE_MISSED,
  deleteBlockReason,
  deleteFacilityType,
  fetchFacilityTypeUsage,
  fillEmptyTranslations,
  insertFacilityType,
  newFacilityTypeCode,
  swapTypeOrder,
  translateTypeLabel,
  typeFormError,
  typeFormFrom,
  typePayload,
  typeSwapArgs,
  updateFacilityType,
  withPendingSwap,
} = await import("./facilityTypeAdmin");

const RAMP = {
  code: "ramp",
  label: "경사로",
  label_en: "Ramp",
  label_zh: "坡道",
  icon: "trending-up",
  color: "#B25617",
  sort_order: 2,
};
const PARKING = {
  code: "parking",
  label: "장애인 주차",
  label_en: null,
  label_zh: null,
  icon: "square-parking",
  color: "#6D4AB0",
  sort_order: 3,
};
const LOUNGE = {
  code: "student_lounge",
  label: "장애학생 휴게실",
  label_en: null,
  label_zh: null,
  icon: "sofa",
  color: "#0F766E",
  sort_order: 7,
};

beforeEach(() => {
  mocks.from.mockReset();
  mocks.authedFetch.mockReset();
});

describe("폼 값", () => {
  it("새 종류는 DB 기본값(휠체어·회색)에서, 고칠 종류는 그 값에서 시작한다", () => {
    expect(typeFormFrom(null)).toEqual({
      label: "",
      label_en: "",
      label_zh: "",
      icon: "accessibility",
      color: "#666666",
    });
    expect(typeFormFrom(RAMP)).toEqual({
      label: "경사로",
      label_en: "Ramp",
      label_zh: "坡道",
      icon: "trending-up",
      color: "#B25617",
    });
  });

  it("앞뒤 공백을 떼고 빈 번역 칸(공백만 있어도)은 null로 보낸다", () => {
    expect(
      typePayload({
        label: " 수유실 ",
        label_en: "   ",
        label_zh: "",
        icon: "baby",
        color: "#BE185D",
      }),
    ).toEqual({
      label: "수유실",
      label_en: null,
      label_zh: null,
      icon: "baby",
      color: "#BE185D",
    });
  });

  it("한국어 이름이 비거나 다른 종류와 같거나 번역 이름이 길면 막는다", () => {
    const form = typeFormFrom(null);
    expect(typeFormError(form, [RAMP], null)).toBe("한국어 이름을 적어 주세요");
    expect(typeFormError({ ...form, label: " 경사로 " }, [RAMP], null)).toBe(
      "같은 이름의 종류가 있어요",
    );
    expect(
      typeFormError({ ...form, label: "경사로" }, [RAMP], "ramp"),
    ).toBeNull();
    expect(
      typeFormError(
        { ...form, label: "수유실", label_en: "a".repeat(61) },
        [RAMP],
        null,
      ),
    ).toBe("영어 이름은 60자까지예요");
    expect(
      typeFormError(
        { ...form, label: "수유실", label_zh: "a".repeat(61) },
        [RAMP],
        null,
      ),
    ).toBe("중국어 이름은 60자까지예요");
    expect(
      typeFormError(
        { ...form, label: "수유실", label_en: "a".repeat(60) },
        [RAMP],
        null,
      ),
    ).toBeNull();
  });

  it("자동번역은 빈 칸만 채운다", () => {
    const form = {
      ...typeFormFrom(null),
      label: "수유실",
      label_en: "Nursing room",
    };
    expect(
      fillEmptyTranslations(form, { en: "Lactation room", zh: "哺乳室" }),
    ).toMatchObject({ label_en: "Nursing room", label_zh: "哺乳室" });
  });
});

describe("새 종류 코드", () => {
  it("type_ 뒤에 소문자·숫자 8자다", () => {
    expect(newFacilityTypeCode(() => 0)).toBe("type_aaaaaaaa");
    expect(newFacilityTypeCode(() => 0.9999)).toBe("type_99999999");
    expect(newFacilityTypeCode()).toMatch(/^type_[a-z0-9]{8}$/);
  });
});

describe("순서", () => {
  const types = [RAMP, PARKING, LOUNGE];

  it("화면 순서(앞, 뒤)로 인자를 만들고 끝에서는 null이다", () => {
    expect(typeSwapArgs(types, 1, "earlier")).toEqual({
      p_first: "ramp",
      p_second: "parking",
    });
    expect(typeSwapArgs(types, 1, "later")).toEqual({
      p_first: "parking",
      p_second: "student_lounge",
    });
    expect(typeSwapArgs(types, 0, "earlier")).toBeNull();
    expect(typeSwapArgs(types, 2, "later")).toBeNull();
  });

  it("두 종류의 자리와 번호를 바꾸고, 같은 둘로 다시 부르면 제자리다", () => {
    const swapped = swapTypeOrder(types, "ramp", "parking");
    expect(swapped.map((type) => [type.code, type.sort_order])).toEqual([
      ["parking", 2],
      ["ramp", 3],
      ["student_lounge", 7],
    ]);
    expect(swapTypeOrder(swapped, "ramp", "parking")).toEqual(types);
  });

  it("저장 중인 맞바꾸기는 앞 종류가 아직 앞일 때만 겹친다", () => {
    const swap = { p_first: "ramp", p_second: "parking" };
    expect(withPendingSwap(types, null)).toBe(types);
    expect(withPendingSwap(types, swap).map((type) => type.code)).toEqual([
      "parking",
      "ramp",
      "student_lounge",
    ]);
    // 다시 받은 목록에 이미 반영됐다 — 겹치면 다시 뒤집는다
    const reloaded = [
      { ...PARKING, sort_order: 2 },
      { ...RAMP, sort_order: 3 },
      LOUNGE,
    ];
    expect(withPendingSwap(reloaded, swap)).toBe(reloaded);
  });
});

describe("삭제 막기", () => {
  it("쓰는 시설·검토 대기 요청이 있으면 이유를, 없으면 null을 준다", () => {
    const usage = {
      ramp: { facilities: 2, pendingRequests: 0 },
      parking: { facilities: 0, pendingRequests: 1 },
      both: { facilities: 1, pendingRequests: 3 },
      unused: { facilities: 0, pendingRequests: 0 },
    };
    expect(deleteBlockReason(usage, "ramp")).toBe("시설 2곳이 이 종류를 써요");
    expect(deleteBlockReason(usage, "parking")).toBe(
      "검토 대기 요청 1건이 이 종류로 들어왔어요",
    );
    expect(deleteBlockReason(usage, "both")).toBe(
      "시설 1곳이 이 종류를 써요 · 검토 대기 요청 3건이 이 종류로 들어왔어요",
    );
    expect(deleteBlockReason(usage, "unused")).toBeNull();
  });

  it("받은 현황에 없는 종류는 지울 수 있는지 모르니 막는다", () => {
    expect(deleteBlockReason({}, "type_new00001")).toBe(
      "사용 현황을 불러오지 못했어요",
    );
    expect(deleteBlockReason({}, "constructor")).toBe(
      "사용 현황을 불러오지 못했어요",
    );
  });
});

describe("서버 호출", () => {
  const payload = () => typePayload({ ...typeFormFrom(null), label: "수유실" });
  function counter() {
    let issued = 0;
    return () => `type_${String((issued += 1)).padStart(8, "0")}`;
  }
  function insertedCodes() {
    return mocks.from.mock.results.map(
      (result) =>
        (
          (result.value as { calls: QueryCall[] }).calls[0].args[0] as {
            code: string;
          }
        ).code,
    );
  }

  it("사용 현황을 받고, 실패하면 null이다", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ ramp: { facilities: 2, pendingRequests: 0 } }),
    );
    expect(await fetchFacilityTypeUsage()).toEqual({
      ramp: { facilities: 2, pendingRequests: 0 },
    });
    expect(mocks.authedFetch).toHaveBeenCalledWith("/api/facility-types/usage");
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ error: "x" }, { status: 500 }),
    );
    expect(await fetchFacilityTypeUsage()).toBeNull();
    mocks.authedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await fetchFacilityTypeUsage()).toBeNull();
  });

  it("한국어 이름을 label 키로 번역하고, 실패하면 null이다", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ en: { label: "Nursing room" }, zh: { label: "哺乳室" } }),
    );
    expect(await translateTypeLabel("수유실")).toEqual({
      en: "Nursing room",
      zh: "哺乳室",
    });
    expect(JSON.parse(mocks.authedFetch.mock.calls[0][1].body)).toEqual({
      texts: { label: "수유실" },
    });
    mocks.authedFetch.mockResolvedValueOnce(
      Response.json({ error: "x" }, { status: 502 }),
    );
    expect(await translateTypeLabel("수유실")).toBeNull();
  });

  it("코드가 겹치면 새 코드로 한 번만 더 넣는다", async () => {
    mocks.from
      .mockReturnValueOnce(
        queryStub({ error: { code: "23505", message: "dup" } }),
      )
      .mockReturnValueOnce(queryStub({ error: null }));
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: true,
    });
    expect(insertedCodes()).toEqual(["type_00000001", "type_00000002"]);
  });

  it("두 번 겹치면 그만두고 23505를 돌려준다", async () => {
    mocks.from.mockReturnValue(
      queryStub({ error: { code: "23505", message: "dup" } }),
    );
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: false,
      code: "23505",
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("다른 오류는 다시 넣지 않는다", async () => {
    mocks.from.mockReturnValue(
      queryStub({ error: { code: "42501", message: "rls" } }),
    );
    expect(await insertFacilityType(payload(), counter())).toEqual({
      ok: false,
      code: "42501",
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("지우기는 code로 고르고 외래 키 오류 코드를 돌려준다", async () => {
    const stub = queryStub({
      data: null,
      error: { code: "23503", message: "fk" },
    });
    mocks.from.mockReturnValue(stub);
    expect(await deleteFacilityType("ramp")).toEqual({
      ok: false,
      code: "23503",
    });
    expect(stub.calls).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["code", "ramp"] },
      { method: "select", args: ["code"] },
    ]);
  });

  it("고치기·지우기가 0행이면(RLS가 걸렀거나 그사이 지워졌다) 실패다", async () => {
    mocks.from.mockReturnValue(queryStub({ data: [], error: null }));
    expect(await updateFacilityType("ramp", payload())).toEqual({
      ok: false,
      code: TYPE_WRITE_MISSED,
    });
    expect(await deleteFacilityType("ramp")).toEqual({
      ok: false,
      code: TYPE_WRITE_MISSED,
    });
    mocks.from.mockReturnValue(
      queryStub({ data: [{ code: "ramp" }], error: null }),
    );
    expect(await updateFacilityType("ramp", payload())).toEqual({ ok: true });
    expect(await deleteFacilityType("ramp")).toEqual({ ok: true });
  });
});
