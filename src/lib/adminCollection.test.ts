import { describe, expect, it } from "vitest";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminCollectionPolicy,
} from "./adminCollection";

interface Item {
  id: string;
  name: string;
  updated_at: string;
  tags: string[];
}

const policy: AdminCollectionPolicy<Item, "red" | "blue"> = {
  id: (item) => item.id,
  name: (item) => item.name,
  updatedAt: (item) => item.updated_at,
  searchText: (item) => [item.name],
  chips: {
    red: (item) => item.tags.includes("red"),
    blue: (item) => item.tags.includes("blue"),
  },
};

const items: Item[] = [
  {
    id: "a",
    name: "가 시설",
    updated_at: "2026-10-01T00:00:00Z",
    tags: ["red"],
  },
  {
    id: "b",
    name: "나 시설",
    updated_at: "2026-10-03T00:00:00Z",
    tags: ["red", "blue"],
  },
  { id: "c", name: "다 시설", updated_at: "2026-10-02T00:00:00Z", tags: [] },
];

const query = INITIAL_ADMIN_COLLECTION_QUERY;

describe("viewAdminCollection", () => {
  it("칩으로 거르고 정렬한다", () => {
    const view = viewAdminCollection(items, policy, { ...query, chip: "red" });
    expect(view.matched.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("검색은 정책의 searchText에서 찾는다", () => {
    const view = viewAdminCollection(items, policy, { ...query, search: "다" });
    expect(view.matched.map((item) => item.id)).toEqual(["c"]);
  });

  it("칩 개수는 검색·추가 조건과 상관없이 전체 행 기준이다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      search: "가",
      filter: (item) => item.id !== "b",
    });
    expect(view.chipCounts).toEqual({ all: 3, red: 2, blue: 1 });
    expect(view.total).toBe(3);
    expect(view.matched.map((item) => item.id)).toEqual(["a"]);
  });

  it("페이지를 나누고 범위를 넘으면 마지막 페이지로 둔다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      page: 5,
      pageSize: 2,
    });
    expect(view.pageCount).toBe(2);
    expect(view.page).toBe(2);
    expect(view.pageItems.map((item) => item.id)).toEqual(["a"]);
    // 지도는 페이지와 상관없이 거른 결과 전체를 그린다(설계 2026-10-14 3.3)
    expect(view.matched).toHaveLength(3);
  });

  it("결과가 없어도 페이지는 1이다", () => {
    const view = viewAdminCollection(items, policy, {
      ...query,
      search: "없는 이름",
    });
    expect(view.matched).toEqual([]);
    expect(view.page).toBe(1);
    expect(view.pageCount).toBe(1);
  });
});

describe("pageOfItem", () => {
  it("항목이 있는 페이지를 돌려주고 없으면 null이다", () => {
    const { matched } = viewAdminCollection(items, policy, query);
    expect(pageOfItem(matched, "b", policy.id, 2)).toBe(1);
    expect(pageOfItem(matched, "a", policy.id, 2)).toBe(2);
    expect(pageOfItem(matched, "zz", policy.id, 2)).toBeNull();
  });
});
