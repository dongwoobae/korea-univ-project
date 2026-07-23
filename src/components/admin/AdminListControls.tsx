import type { ReactNode } from "react";

interface AdminListControlsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  resultCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
  children?: ReactNode;
}

export default function AdminListControls({
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  resultCount,
  totalCount,
  hasActiveFilters,
  onReset,
  children,
}: AdminListControlsProps) {
  const resultLabel = `전체 ${totalCount}개 중 ${resultCount}개 표시`;

  return (
    <div className="ku-admin-list-controls">
      <label className="ku-admin-list-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
        />
      </label>
      {children}
      {hasActiveFilters && (
        <button type="button" className="ku-admin-list-reset" onClick={onReset}>
          초기화
        </button>
      )}
      <span
        className="ku-admin-list-result-count"
        role="status"
        aria-label={resultLabel}
      >
        {resultCount} / {totalCount}개
      </span>
    </div>
  );
}
