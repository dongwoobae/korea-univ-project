import { describe, expect, it } from "vitest";
import {
  ADMIN_SUMMARY_ITEMS,
  resolveFlagFilter,
  resolveSummary,
  type AdminBuildingSummary,
} from "./adminBuildingSummary";

const summary: AdminBuildingSummary = {
  registered_facility_count: 40,
  missing_facility_count: 12,
  missing_photo_count: 9,
  missing_location_count: 3,
  stale_update_count: 21,
  translation_needed_count: 12,
  translation_needed_building_count: 7,
};

const ok = { count: 96, error: null };

describe("resolveSummary", () => {
  it("셋 다 성공하면 값을 돌려준다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: summary,
        error: null,
      },
    );

    expect(result).toEqual({
      status: "ok",
      value: { overallTotalCount: 96, deletedCount: 4, summary },
    });
  });

  it("RPC가 실패하면 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: null,
        error: { message: "function does not exist" },
      },
    );

    expect(result.status).toBe("error");
  });

  it("RPC가 아닌 전체 건물 count만 실패해도 실패 상태가 된다", () => {
    const result = resolveSummary(
      { count: null, error: { message: "boom" } },
      { count: 4, error: null },
      { data: summary, error: null },
    );

    expect(result.status).toBe("error");
  });

  it("삭제 건물 count만 실패해도 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: null, error: { message: "boom" } },
      { data: summary, error: null },
    );

    expect(result.status).toBe("error");
  });

  it("오류가 없어도 RPC 데이터가 없으면 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: null,
        error: null,
      },
    );

    expect(result.status).toBe("error");
  });
});

describe("resolveFlagFilter", () => {
  it("오류면 error", () => {
    expect(
      resolveFlagFilter({ data: null, error: { message: "boom" } }).status,
    ).toBe("error");
  });

  it("0건이면 empty (빈 배열을 .in()에 넘기지 않기 위해)", () => {
    expect(resolveFlagFilter({ data: [], error: null }).status).toBe("empty");
  });

  it("building_id가 null인 행은 버린다", () => {
    expect(
      resolveFlagFilter({ data: [{ building_id: null }], error: null }).status,
    ).toBe("empty");
  });

  it("1건 이상이면 id 배열을 돌려준다", () => {
    expect(
      resolveFlagFilter({
        data: [{ building_id: 1 }, { building_id: null }, { building_id: 7 }],
        error: null,
      }),
    ).toEqual({ status: "ids", ids: [1, 7] });
  });
});

describe("ADMIN_SUMMARY_ITEMS", () => {
  it("경고 카드 5개만 flag를 갖는다", () => {
    expect(ADMIN_SUMMARY_ITEMS.filter((item) => item.flag)).toHaveLength(5);
    expect(
      ADMIN_SUMMARY_ITEMS.find((item) => item.id === "registered_facility")
        ?.flag,
    ).toBeUndefined();
  });

  it("번역 필요 카드는 시설 수와 건물 수를 함께 보여준다", () => {
    const item = ADMIN_SUMMARY_ITEMS.find(
      (entry) => entry.id === "translation_needed",
    )!;

    expect(item.parts(summary)).toEqual([
      { prefix: "시설", value: 12 },
      { prefix: "건물", value: 7 },
    ]);
  });

  it("나머지 카드는 값 하나만 보여준다", () => {
    for (const item of ADMIN_SUMMARY_ITEMS) {
      if (item.id === "translation_needed") continue;
      expect(item.parts(summary)).toHaveLength(1);
    }
  });
});
