export type AdminListSort = "updated-desc" | "updated-asc" | "name";

export const ADMIN_PAGE_SIZE = 20;

export function buildAdminSearchFilter(columns: string[], query: string) {
  const safeTerms = query
    .trim()
    .replace(/[\\,"'().*%_]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (safeTerms.length === 0) return null;
  const pattern = `*${safeTerms.join("*")}*`;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function getAdminPageRange(page: number, pageSize = ADMIN_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function getAdminPageCount(
  totalCount: number,
  pageSize = ADMIN_PAGE_SIZE,
) {
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize));
}

export function getAdminPaginationPages(
  page: number,
  pageCount: number,
  windowSize = 5,
) {
  const safePageCount = Math.max(1, Math.floor(pageCount));
  const safeWindowSize = Math.max(1, Math.floor(windowSize));
  const visibleCount = Math.min(safeWindowSize, safePageCount);
  const safePage = Math.min(Math.max(1, Math.floor(page)), safePageCount);
  const halfWindow = Math.floor(visibleCount / 2);
  const maxStart = safePageCount - visibleCount + 1;
  const start = Math.min(Math.max(1, safePage - halfWindow), maxStart);
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

export function matchesAdminSearch(
  query: string,
  values: Array<string | null | undefined>,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalizedQuery) return true;
  return values.some((value) =>
    (value ?? "").toLocaleLowerCase("ko-KR").includes(normalizedQuery),
  );
}

export function sortAdminItems<T>(
  items: T[],
  sort: AdminListSort,
  getName: (item: T) => string,
  getUpdatedAt: (item: T) => string | null | undefined,
) {
  return [...items].sort((left, right) => {
    if (sort === "name")
      return getName(left).localeCompare(getName(right), "ko");

    const leftTime = Date.parse(getUpdatedAt(left) ?? "") || 0;
    const rightTime = Date.parse(getUpdatedAt(right) ?? "") || 0;
    return sort === "updated-desc"
      ? rightTime - leftTime
      : leftTime - rightTime;
  });
}

export function formatAdminUpdatedAt(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "수정일 없음";
  return `수정 ${date.toLocaleDateString("ko-KR")}`;
}
