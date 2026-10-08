"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import type { InboxFilter } from "@/lib/inboxStatus";

export type InboxListState = "loading" | "error" | "ready";

/**
 * 제보함 목록(등록 요청·피드백)의 상태 필터·페이지·불러오기.
 * 응답을 읽지 못하면 빈 목록이 아니라 오류로 두고, 다시 불러올 때 이전 행을 비운다.
 */
export function useInboxList<T>(
  endpoint: string,
  params: Record<string, string>,
  refreshKey: number,
) {
  const [filter, setFilterState] = useState<InboxFilter>("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<InboxListState>("loading");
  // 호출부가 매 렌더 새 객체를 넘겨도 다시 불러오지 않게 문자열로 비교한다.
  const query = new URLSearchParams({
    status: filter,
    page: String(page),
    ...params,
  }).toString();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setState("loading");
      const response = await authedFetch(`${endpoint}?${query}`).catch(
        () => null,
      );
      if (cancelled) return;
      const body = response?.ok
        ? ((await response.json().catch(() => null)) as {
            items: T[];
            total: number;
          } | null)
        : null;
      if (cancelled) return;
      if (!body || !Array.isArray(body.items)) {
        setItems([]);
        setTotal(0);
        setState("error");
        return;
      }
      setItems(body.items);
      setTotal(body.total);
      setState("ready");
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [endpoint, query, refreshKey]);

  function setFilter(next: InboxFilter) {
    setFilterState(next);
    setPage(1);
  }

  return { filter, setFilter, page, setPage, items, total, state };
}
