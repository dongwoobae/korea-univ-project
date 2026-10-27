import type { CampusFlags } from "./FilterPanel";

/** 공개 지도 메뉴. 설계: docs/specs/2026-10-27-map-menu-design.md */

export type MenuPanel = "search" | "filter" | "favorites" | "browse";
export type MenuLayout = "expanded" | "rail" | "bar";

export const MENU_PANELS: readonly MenuPanel[] = [
  "search",
  "filter",
  "favorites",
  "browse",
];

/** 여는 버튼의 `aria-controls`가 세 모드 모두 이 id를 가리킨다 */
export const MENU_PANEL_ID: Record<MenuPanel, string> = {
  search: "map-search-panel",
  filter: "map-filter-panel",
  favorites: "map-favorites-panel",
  browse: "map-browse-panel",
};

const COLLAPSED_KEY = "ku_menu_collapsed";

// localStorage는 꺼내는 것부터 던질 수 있어(사생활 보호 모드·차단) 저장소를 돌려주는 함수를 받는다.
// 펼친 적이 있을 때("false")만 펼친다. 처음 방문·모르는 값·읽기 실패는 접힘(멘토링 설계 2장의 "없을 때")
export function readMenuCollapsed(storage: () => Pick<Storage, "getItem">) {
  try {
    return storage().getItem(COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeMenuCollapsed(
  storage: () => Pick<Storage, "setItem">,
  collapsed: boolean,
) {
  try {
    storage().setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // 남기지 못해도 화면은 바뀐다(멘토링 설계 2장)
  }
}

export function menuLayout(isMobile: boolean, collapsed: boolean): MenuLayout {
  if (isMobile) return "bar";
  return collapsed ? "rail" : "expanded";
}

/** 기본값에서 벗어난 조건 수. 명소 표시는 기본값이 true라 숨겼을 때만 센다 — 첫 로드가 0이다 */
export function activeFilterCount(filters: {
  activeCampuses: CampusFlags;
  activeTypes: Record<string, boolean>;
  showSlope: boolean;
  showLandmarks: boolean;
}) {
  const count = (flags: Record<string, boolean>) =>
    Object.values(flags).filter(Boolean).length;
  return (
    count(filters.activeCampuses) +
    count(filters.activeTypes) +
    Number(filters.showSlope) +
    Number(!filters.showLandmarks)
  );
}

/** 모바일 검색 패널이 들 세로 범위(설계 4.2). 화상 키보드는 레이아웃 뷰포트가 아니라 보이는 영역을 줄이거나 옮긴다 */
export function visibleArea({
  viewport,
  barTop,
}: {
  viewport: { offsetTop: number; height: number } | null;
  barTop: number;
}) {
  if (!viewport) return { top: 0, bottom: barTop };
  return {
    top: viewport.offsetTop,
    bottom: Math.min(viewport.offsetTop + viewport.height, barTop),
  };
}
