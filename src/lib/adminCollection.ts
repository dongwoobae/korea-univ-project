import {
  ADMIN_PAGE_SIZE,
  getAdminPageCount,
  matchesAdminSearch,
  sortAdminItems,
  type AdminListSort,
} from "@/lib/adminList";

/** 조회는 하지 않는다. 테이블과 칩 의미는 탭이 정책으로 넘긴다(설계 2026-10-14 3.2) */
export type AdminChip<C extends string> = "all" | C;

export interface AdminCollectionPolicy<T, C extends string> {
  id: (item: T) => string;
  name: (item: T) => string;
  updatedAt: (item: T) => string | null | undefined;
  searchText: (item: T) => Array<string | null | undefined>;
  chips: Record<C, (item: T) => boolean>;
}

export interface AdminCollectionQuery<T, C extends string> {
  search: string;
  chip: AdminChip<C>;
  sort: AdminListSort;
  page: number;
  /** 칩과 별개로 좁히는 조건(시설 유형 드롭다운 등) */
  filter?: (item: T) => boolean;
  pageSize?: number;
}

export interface AdminCollectionView<T, C extends string> {
  total: number;
  matched: T[];
  pageItems: T[];
  page: number;
  pageCount: number;
  chipCounts: Record<AdminChip<C>, number>;
}

export const INITIAL_ADMIN_COLLECTION_QUERY = {
  search: "",
  chip: "all",
  sort: "updated-desc",
  page: 1,
} as const;

export function viewAdminCollection<T, C extends string>(
  items: T[],
  policy: AdminCollectionPolicy<T, C>,
  query: AdminCollectionQuery<T, C>,
): AdminCollectionView<T, C> {
  const pageSize = query.pageSize ?? ADMIN_PAGE_SIZE;
  const chipTest = query.chip === "all" ? null : policy.chips[query.chip];
  const matched = sortAdminItems(
    items.filter(
      (item) =>
        (!query.filter || query.filter(item)) &&
        (!chipTest || chipTest(item)) &&
        matchesAdminSearch(query.search, policy.searchText(item)),
    ),
    query.sort,
    policy.name,
    policy.updatedAt,
  );
  const pageCount = getAdminPageCount(matched.length, pageSize);
  const page = Math.min(Math.max(1, Math.floor(query.page)), pageCount);

  const chipCounts = { all: items.length } as Record<AdminChip<C>, number>;
  for (const key of Object.keys(policy.chips) as C[]) {
    chipCounts[key] = items.filter(policy.chips[key]).length;
  }

  return {
    total: items.length,
    matched,
    pageItems: matched.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    chipCounts,
  };
}

export function pageOfItem<T>(
  matched: T[],
  id: string,
  getId: (item: T) => string,
  pageSize = ADMIN_PAGE_SIZE,
): number | null {
  const index = matched.findIndex((item) => getId(item) === id);
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}
