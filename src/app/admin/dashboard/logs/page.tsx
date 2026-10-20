"use client";

import { useEffect, useState } from "react";
import ActivityLogDetailModal from "@/components/admin/logs/ActivityLogDetailModal";
import LevelBadge from "@/components/admin/logs/LevelBadge";
import { useActivityLogList } from "@/components/admin/logs/useActivityLogList";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import {
  formatLogTime,
  summarize,
  targetText,
  type ActivityLogRow,
} from "@/lib/activityLabels";
import {
  LOG_LEVELS,
  readLogLevel,
  writeLogLevel,
  type LogLevel,
} from "@/lib/activityLogList";
import { useMediaQuery } from "@/lib/useMediaQuery";

export default function ActivityLogsPage() {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [level, setLevel] = useState<LogLevel | null | undefined>(undefined);
  const [selected, setSelected] = useState<ActivityLogRow | null>(null);
  const { state, loadMore, reload } = useActivityLogList(level);

  // useSearchParams는 Suspense 경계를 요구한다. 다른 관리자 화면처럼 location에서 읽는다.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setLevel(readLogLevel(window.location.search)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  function changeLevel(value: string) {
    const next = (LOG_LEVELS as readonly string[]).includes(value)
      ? (value as LogLevel)
      : null;
    const search = writeLogLevel(window.location.search, next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
    setLevel(next);
  }

  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <div>
          <h1 className="ku-admin-title">로그</h1>
          <p className="ku-admin-caption">
            관리자 화면의 변경과 실패 기록. 최신순
          </p>
        </div>
      </div>

      <div className="ku-admin-list-controls">
        <select
          aria-label="로그 유형"
          value={level ?? "all"}
          disabled={level === undefined}
          onChange={(event) => changeLevel(event.target.value)}
        >
          <option value="all">전체</option>
          {LOG_LEVELS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {state.status === "loading" ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : state.status === "error" ? (
        <div className="ku-admin-empty">
          로그를 불러오지 못했어요.{" "}
          <button className="ku-admin-button" type="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : state.rows.length === 0 ? (
        <div className="ku-admin-empty">기록이 없습니다.</div>
      ) : mobile ? (
        <ul className="ku-log-cards" aria-label="로그 목록">
          {state.rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="ku-log-card"
                onClick={() => setSelected(row)}
              >
                <span className="ku-log-card-meta">
                  <span className="ku-log-time">
                    {formatLogTime(row.occurred_at)}
                  </span>
                  <LevelBadge level={row.level} />
                  <span>{row.actor_label}</span>
                </span>
                <span className="ku-log-card-target">{targetText(row)}</span>
                <span className="ku-log-card-summary">{summarize(row)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ku-log-list">
          <div className="ku-log-head" aria-hidden="true">
            <span>시각</span>
            <span>로그 유형</span>
            <span>사람</span>
            <span>대상</span>
            <span>내용</span>
          </div>
          <ul aria-label="로그 목록">
            {state.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="ku-log-row"
                  onClick={() => setSelected(row)}
                >
                  <span className="ku-log-cell ku-log-time">
                    {formatLogTime(row.occurred_at)}
                  </span>
                  <span className="ku-log-cell">
                    <LevelBadge level={row.level} />
                  </span>
                  <span className="ku-log-cell">{row.actor_label}</span>
                  <span className="ku-log-cell">{targetText(row)}</span>
                  <span className="ku-log-cell">{summarize(row)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "ready" &&
        (state.hasMore || state.more === "error") && (
          <div className="ku-log-more">
            {state.more === "error" && (
              <span role="alert">더 불러오지 못했어요</span>
            )}
            <button
              type="button"
              className="ku-inbox-more"
              disabled={state.more === "loading"}
              onClick={loadMore}
            >
              {state.more === "error" ? "다시 시도" : "더 보기"}
            </button>
          </div>
        )}

      {selected && (
        <ActivityLogDetailModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
