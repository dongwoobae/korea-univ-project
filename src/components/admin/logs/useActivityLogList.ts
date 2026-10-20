"use client";

import { useEffect, useEffectEvent, useReducer } from "react";
import {
  fetchLogPage,
  initialLogList,
  logListReducer,
  type LogCursor,
  type LogLevel,
} from "@/lib/activityLogList";

/** 응답에 요청한 때의 세대를 실어 필터를 바꾼 뒤 도착한 낡은 응답을 리듀서가 버리게 한다(제보함과 같다). */
export function useActivityLogList(level: LogLevel | null | undefined) {
  const [state, dispatch] = useReducer(logListReducer, initialLogList);

  if (level !== undefined && level !== state.level) {
    dispatch({ type: "load", level });
  }

  async function request(
    generation: number,
    requestLevel: LogLevel | null,
    cursor: LogCursor | null,
  ) {
    const page = await fetchLogPage(requestLevel, cursor);
    const append = cursor !== null;
    dispatch(
      page
        ? { type: "pageLoaded", generation, append, ...page }
        : { type: "pageFailed", generation, append },
    );
  }

  const startFirstPage = useEffectEvent((generation: number) => {
    if (generation === 0 || state.level === undefined) return;
    void request(generation, state.level, null);
  });
  useEffect(() => {
    startFirstPage(state.generation);
  }, [state.generation]);

  function loadMore() {
    const last = state.rows.at(-1);
    if (!last || state.level === undefined || state.status !== "ready") return;
    if (state.more === "loading" || (!state.hasMore && state.more !== "error"))
      return;
    dispatch({ type: "moreRequested" });
    void request(state.generation, state.level, {
      occurred_at: last.occurred_at,
      id: last.id,
    });
  }

  function reload() {
    dispatch({ type: "reload" });
  }

  return { state, loadMore, reload };
}
