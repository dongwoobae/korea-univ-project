"use client";

import { useEffect, useEffectEvent, useReducer } from "react";
import { authedFetch } from "@/lib/authedFetch";
import {
  hasMorePages,
  inboxBoardOptionsKey,
  inboxBoardReducer,
  initialInboxBoardState,
  type InboxBoardOptions,
  type InboxCard,
  type InboxKind,
} from "@/lib/inboxBoard";
import type { InboxFilter } from "@/lib/inboxStatus";

const ENDPOINTS: Record<InboxKind, string> = {
  requests: "/api/facility-requests",
  feedback: "/api/admin-feedback",
};

interface PageResult {
  cards: InboxCard[];
  total: number;
}

/** 응답을 읽지 못하거나 모양이 다르면 빈 목록이 아니라 실패(null)로 친다. */
async function fetchInboxPage(
  filter: InboxFilter,
  kind: InboxKind,
  page: number,
  building: number | null,
): Promise<PageResult | null> {
  const params = new URLSearchParams({ status: filter, page: String(page) });
  // 피드백 API는 building을 모른다.
  if (kind === "requests" && building) params.set("building", String(building));
  const response = await authedFetch(`${ENDPOINTS[kind]}?${params}`).catch(
    () => null,
  );
  const body = response?.ok
    ? ((await response.json().catch(() => null)) as {
        items?: unknown;
        total?: unknown;
      } | null)
    : null;
  if (!body || !Array.isArray(body.items) || typeof body.total !== "number") {
    return null;
  }
  const items = body.items as InboxCard["item"][];
  return {
    cards: items.map((item) => ({ kind, item }) as InboxCard),
    total: body.total,
  };
}

/**
 * 제보함 보드의 조회. 열(상태) × 종류마다 소스 하나를 두고, 응답에는 요청한 때의 세대를 실어
 * 보드를 다시 받은 뒤 도착한 낡은 응답을 리듀서가 버리게 한다.
 */
export function useInboxBoard(options: InboxBoardOptions) {
  const [state, dispatch] = useReducer(
    inboxBoardReducer,
    options,
    initialInboxBoardState,
  );

  // 옵션이 바뀌면 렌더 중에 새 세대로 다시 받는다("이전 렌더 값으로 state 조정").
  if (inboxBoardOptionsKey(options) !== state.optionsKey) {
    dispatch({ type: "load", options });
  }

  async function requestPage(
    generation: number,
    filter: InboxFilter,
    kind: InboxKind,
    page: number,
  ) {
    const result = await fetchInboxPage(filter, kind, page, options.building);
    if (!result) {
      dispatch({ type: "pageFailed", generation, filter, kind, page });
      return;
    }
    dispatch({
      type: "pageLoaded",
      generation,
      filter,
      kind,
      page,
      cards: result.cards,
      total: result.total,
    });
  }

  // 첫 쪽 요청은 세대가 바뀔 때 이 effect만 시작한다. 같은 렌더에서 reload가 여러 번 불려도 마지막 세대로 한 벌만 나간다.
  const startFirstPages = useEffectEvent((generation: number) => {
    for (const column of state.columns) {
      for (const kind of Object.keys(column.sources) as InboxKind[]) {
        void requestPage(generation, column.filter, kind, 1);
      }
    }
  });
  useEffect(() => {
    startFirstPages(state.generation);
  }, [state.generation]);

  function reload() {
    dispatch({ type: "load", options });
  }

  function loadMore(filter: InboxFilter, kinds: InboxKind[]) {
    const column = state.columns.find((entry) => entry.filter === filter);
    if (!column) return;
    for (const kind of kinds) {
      const source = column.sources[kind];
      if (!source || source.status !== "ready" || source.more === "loading") {
        continue;
      }
      if (!hasMorePages(source) && source.more !== "error") continue;
      dispatch({ type: "moreRequested", filter, kind });
      void requestPage(state.generation, filter, kind, source.page + 1);
    }
  }

  function retryFirstPage(filter: InboxFilter, kind: InboxKind) {
    const source = state.columns.find((entry) => entry.filter === filter)
      ?.sources[kind];
    if (source?.status !== "error") return;
    dispatch({ type: "firstPageRetryRequested", filter, kind });
    void requestPage(state.generation, filter, kind, 1);
  }

  return { state, reload, loadMore, retryFirstPage };
}
