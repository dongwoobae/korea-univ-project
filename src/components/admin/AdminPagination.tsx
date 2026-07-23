import {
  ADMIN_PAGE_SIZE,
  getAdminPageCount,
  getAdminPaginationPages,
} from "@/lib/adminList";

interface AdminPaginationProps {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}

export default function AdminPagination({
  page,
  totalCount,
  onPageChange,
  pageSize = ADMIN_PAGE_SIZE,
}: AdminPaginationProps) {
  const pageCount = getAdminPageCount(totalCount, pageSize);
  if (pageCount <= 1) return null;
  const pages = getAdminPaginationPages(page, pageCount);

  return (
    <nav className="ku-admin-pagination" aria-label="목록 페이지 이동">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </button>
      <div className="ku-admin-pagination-pages">
        {pages.map((pageNumber) => (
          <button
            className="ku-admin-pagination-number"
            type="button"
            aria-label={`${pageNumber} 페이지`}
            aria-current={pageNumber === page ? "page" : undefined}
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
      </div>
      <span className="ku-sr-only" aria-live="polite">
        {page} / {pageCount}페이지
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </button>
    </nav>
  );
}
