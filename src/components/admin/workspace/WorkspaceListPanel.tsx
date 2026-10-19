"use client";

import { useState, type ReactNode } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import type { AdminListSort } from "@/lib/adminList";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ADMIN_MOBILE_QUERY } from "./types";

export interface WorkspaceChip {
  key: string;
  label: string;
  count: number;
}

export interface WorkspaceLegendItem {
  label: string;
  color: string;
}

interface WorkspaceListPanelProps {
  title: string;
  caption: string;
  addLabel: string;
  onAdd: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** 검색 옆에 두는 추가 필터(유형 드롭다운 등) */
  filters?: ReactNode;
  /** 없거나 비면 칩 줄(`전체` 포함)을 그리지 않는다 */
  chips?: WorkspaceChip[];
  activeChip?: string;
  onChipChange?: (key: string) => void;
  sort: AdminListSort;
  onSortChange: (sort: AdminListSort) => void;
  sortLabel: string;
  status: "loading" | "error" | "ready";
  errorMessage: string;
  onRetry: () => void;
  matchedCount: number;
  page: number;
  onPageChange: (page: number) => void;
  legend: WorkspaceLegendItem[];
  /** 범례 옆(모바일은 바텀시트 맨 아래)에 두는 동작. 경사도 탭만 넘긴다 */
  legendAction?: ReactNode;
  children: ReactNode;
}

const SORT_OPTIONS: { value: AdminListSort; label: string }[] = [
  { value: "updated-desc", label: "최근 수정순" },
  { value: "updated-asc", label: "오래 수정순" },
  { value: "name", label: "이름순" },
];

export default function WorkspaceListPanel({
  title,
  caption,
  addLabel,
  onAdd,
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  filters,
  chips,
  activeChip,
  onChipChange,
  sort,
  onSortChange,
  sortLabel,
  status,
  errorMessage,
  onRetry,
  matchedCount,
  page,
  onPageChange,
  legend,
  legendAction,
  children,
}: WorkspaceListPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [expanded, setExpanded] = useState(false);

  const body =
    status === "loading" ? (
      <p className="ku-float-panel-status">불러오는 중...</p>
    ) : status === "error" ? (
      <div className="ku-float-panel-status" role="alert">
        <p>{errorMessage}</p>
        <button type="button" className="ku-workspace-button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    ) : matchedCount === 0 ? (
      <p className="ku-float-panel-status">조건에 맞는 항목이 없어요</p>
    ) : (
      <>
        {children}
        <AdminPagination
          page={page}
          totalCount={matchedCount}
          onPageChange={onPageChange}
        />
      </>
    );

  const searchRow = (
    <div className="ku-workspace-search-row">
      <label className="ku-workspace-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
        />
      </label>
      {filters}
    </div>
  );

  const chipRow =
    chips && chips.length > 0 ? (
      <div className="ku-chip-row" role="group" aria-label="목록 필터">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="ku-chip"
            aria-pressed={chip.key === activeChip}
            aria-label={`${chip.label} ${chip.count}개`}
            onClick={() => onChipChange?.(chip.key)}
          >
            {chip.label}
            <span className="ku-chip-count" aria-hidden="true">
              {chip.count}
            </span>
          </button>
        ))}
      </div>
    ) : null;

  const sortSelect = (
    <select
      value={sort}
      onChange={(event) => onSortChange(event.target.value as AdminListSort)}
      aria-label={sortLabel}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (mobile) {
    return (
      <>
        <div className="ku-workspace-mobile-bar">
          {searchRow}
          {chipRow}
        </div>
        <section
          className="ku-bottom-sheet"
          aria-label={title}
          data-expanded={expanded || undefined}
        >
          <button
            type="button"
            className="ku-bottom-sheet-handle"
            aria-expanded={expanded}
            aria-label={expanded ? "목록 접기" : "목록 펼치기"}
            onClick={() => setExpanded((value) => !value)}
          >
            <span aria-hidden="true" />
          </button>
          <div className="ku-bottom-sheet-head">
            <h1>{title}</h1>
            <span role="status">{matchedCount}개 표시</span>
            {sortSelect}
            <button
              type="button"
              className="ku-workspace-primary"
              onClick={onAdd}
            >
              ＋ 추가
            </button>
          </div>
          <div className="ku-bottom-sheet-list">{body}</div>
          {legendAction && (
            <div className="ku-bottom-sheet-foot">{legendAction}</div>
          )}
        </section>
      </>
    );
  }

  return (
    <section className="ku-float-panel" aria-label={title}>
      <div className="ku-float-panel-head">
        <div className="ku-float-panel-title-row">
          <div>
            <h1 className="ku-float-panel-title">{title}</h1>
            <p className="ku-float-panel-caption">{caption}</p>
          </div>
          <button
            type="button"
            className="ku-workspace-primary"
            onClick={onAdd}
          >
            {addLabel}
          </button>
        </div>
        {searchRow}
        {chipRow}
      </div>
      <div className="ku-float-panel-result">
        <span role="status">{matchedCount}개 표시</span>
        {sortSelect}
      </div>
      <div className="ku-float-panel-list">{body}</div>
      {(legend.length > 0 || legendAction) && (
        <div className="ku-float-panel-legend-bar">
          {legend.length > 0 && (
            <ul className="ku-float-panel-legend" aria-label="범례">
              {legend.map((item, index) => (
                <li key={index}>
                  <span aria-hidden="true" style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
          {legendAction}
        </div>
      )}
    </section>
  );
}
