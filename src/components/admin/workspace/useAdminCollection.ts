"use client";

import { useState } from "react";
import {
  INITIAL_ADMIN_COLLECTION_QUERY,
  pageOfItem,
  viewAdminCollection,
  type AdminChip,
  type AdminCollectionPolicy,
} from "@/lib/adminCollection";
import type { AdminListSort } from "@/lib/adminList";

/** 검색·칩·정렬을 바꾸면 페이지 1로 간다. 선택을 푸는 것은 호출하는 화면이 한다(설계 2026-10-14 3.3) */
export function useAdminCollection<T, C extends string>(
  items: T[],
  policy: AdminCollectionPolicy<T, C>,
  filter?: (item: T) => boolean,
) {
  const [search, setSearchState] = useState<string>(
    INITIAL_ADMIN_COLLECTION_QUERY.search,
  );
  const [chip, setChipState] = useState<AdminChip<C>>(
    INITIAL_ADMIN_COLLECTION_QUERY.chip,
  );
  const [sort, setSortState] = useState<AdminListSort>(
    INITIAL_ADMIN_COLLECTION_QUERY.sort,
  );
  const [page, setPage] = useState<number>(INITIAL_ADMIN_COLLECTION_QUERY.page);
  const view = viewAdminCollection(items, policy, {
    search,
    chip,
    sort,
    page,
    filter,
  });

  return {
    view,
    search,
    chip,
    sort,
    setSearch: (value: string) => {
      setSearchState(value);
      setPage(1);
    },
    setChip: (value: AdminChip<C>) => {
      setChipState(value);
      setPage(1);
    },
    setSort: (value: AdminListSort) => {
      setSortState(value);
      setPage(1);
    },
    setPage,
    pageOf: (id: string) => pageOfItem(view.matched, id, policy.id),
  };
}
