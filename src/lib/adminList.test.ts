import { describe, expect, it } from "vitest";
import {
  formatAdminUpdatedAt,
  matchesAdminSearch,
  sortAdminItems,
} from "./adminList";

const items = [
  { name: "나 시설", updated_at: "2026-07-21T00:00:00Z" },
  { name: "가 시설", updated_at: "2026-07-23T00:00:00Z" },
];

describe("admin list helpers", () => {
  it("여러 텍스트 필드를 대소문자와 바깥 공백 없이 검색한다", () => {
    expect(matchesAdminSearch(" ramp ", ["중앙광장", "Central Ramp"])).toBe(
      true,
    );
    expect(matchesAdminSearch("주차", ["중앙광장", "Central Ramp"])).toBe(
      false,
    );
  });

  it("최근 수정순과 오래된 수정순으로 정렬한다", () => {
    expect(
      sortAdminItems(
        items,
        "updated-desc",
        (item) => item.name,
        (item) => item.updated_at,
      ).map((item) => item.name),
    ).toEqual(["가 시설", "나 시설"]);
    expect(
      sortAdminItems(
        items,
        "updated-asc",
        (item) => item.name,
        (item) => item.updated_at,
      ).map((item) => item.name),
    ).toEqual(["나 시설", "가 시설"]);
  });

  it("한국어 이름순으로 정렬한다", () => {
    expect(
      sortAdminItems(
        items,
        "name",
        (item) => item.name,
        (item) => item.updated_at,
      ).map((item) => item.name),
    ).toEqual(["가 시설", "나 시설"]);
  });

  it("수정일이 없거나 잘못되면 안전한 대체 문구를 반환한다", () => {
    expect(formatAdminUpdatedAt(null)).toBe("수정일 없음");
    expect(formatAdminUpdatedAt("not-a-date")).toBe("수정일 없음");
    expect(formatAdminUpdatedAt("2026-07-23T00:00:00Z")).toMatch(/^수정 /);
  });
});
