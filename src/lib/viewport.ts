// map-ui.css의 모바일 @media 두 블록이 같은 조건을 쓴다. CSS는 이 문자열을 가져올 수 없어 바꿀 때 함께 고친다
// (docs/specs/2026-10-28-mobile-fixes-design.md 1.1)
export const COMPACT_MEDIA_QUERY =
  "(max-width: 767px), (orientation: landscape) and (max-height: 500px)";

export const COMPACT_LANDSCAPE_MEDIA_QUERY =
  "(orientation: landscape) and (max-height: 500px)";

export function isCompactViewport(): boolean {
  return window.matchMedia(COMPACT_MEDIA_QUERY).matches;
}

export function isCompactLandscape(): boolean {
  return window.matchMedia(COMPACT_LANDSCAPE_MEDIA_QUERY).matches;
}
