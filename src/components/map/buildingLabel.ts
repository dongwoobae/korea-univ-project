import type { Map as LeafletMap, Tooltip } from "leaflet";

/** 공개 지도 건물 이름표의 강조. 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 5.2 */

export const LABEL_HOVERED_CLASS = "ku-building-label--hovered";
export const LABEL_SELECTED_CLASS = "ku-building-label--selected";

/** 보임·모양은 CSS(map-ui.css)가 정한다. 마우스 올림 강조는 이름이 보이는 확대에서만 보인다 */
export function setBuildingLabelEmphasis(
  tooltip: Tooltip | undefined,
  state: { hovered: boolean; selected: boolean },
) {
  const element = tooltip?.getElement();
  if (!tooltip || !element) return;
  let changed = false;
  for (const [name, on] of [
    [LABEL_HOVERED_CLASS, state.hovered],
    [LABEL_SELECTED_CLASS, state.selected],
  ] as const) {
    if (element.classList.contains(name) === on) continue;
    element.classList.toggle(name, on);
    changed = true;
  }
  // 굵기가 바뀌면 너비가 달라져 가운데가 밀린다. Leaflet은 바깥 요소의 transform으로 자리를 잡으므로 다시 잰다
  if (changed) tooltip.update();
}

export const LABEL_REVEAL_MARGIN = 12;

/** map-ui.css `.ku-side-panel`(모바일)의 `height: min(62vh, 620px)`과 같은 식이다. 그쪽을 바꾸면 같이 바꾼다 */
export function mobileSheetHeight(viewportHeight: number) {
  return Math.min(viewportHeight * 0.62, 620);
}

export type DetailLayout = "portrait" | "landscape" | "web";

/**
 * 상세가 지도를 덮을 자리를 `fitBounds`의 `paddingBottomRight`로 준다(설계 docs/specs/2026-10-28-mobile-fixes-design.md 3).
 * map-ui.css의 `.ku-side-panel` 세 규칙(기본·좁은 화면·가로 좁은 화면)과 같은 식이다. 그쪽을 바꾸면 같이 바꾼다.
 */
export function detailPadding(
  kind: DetailLayout,
  viewport: { width: number; height: number },
): [number, number] {
  if (kind === "portrait") return [0, mobileSheetHeight(viewport.height)];
  if (kind === "landscape") return [Math.min(360, viewport.width / 2), 0];
  return [340, 0];
}

/** `labelRevealOffset`의 가로판. 보이는 영역은 왼쪽 0 ~ 지도 폭 − 옆 패널 폭이고 `panBy`의 가로 거리를 돌려준다 */
export function labelRevealOffsetX({
  labelCenterX,
  labelWidth,
  mapWidth,
  panelWidth,
}: {
  labelCenterX: number;
  labelWidth: number;
  mapWidth: number;
  panelWidth: number;
}) {
  const visibleRight = mapWidth - panelWidth;
  const left = labelCenterX - labelWidth / 2;
  const right = labelCenterX + labelWidth / 2;
  if (
    left >= LABEL_REVEAL_MARGIN &&
    right <= visibleRight - LABEL_REVEAL_MARGIN
  )
    return 0;
  return Math.round(labelCenterX - visibleRight / 2);
}

/** 이름표가 지도 위 ~ 시트 위 영역 밖이면 그 영역 가운데로 오게 할 `panBy` 세로 거리. 보이면 0 */
export function labelRevealOffset({
  labelCenterY,
  labelHeight,
  mapHeight,
  sheetHeight,
}: {
  labelCenterY: number;
  labelHeight: number;
  mapHeight: number;
  sheetHeight: number;
}) {
  const visibleBottom = mapHeight - sheetHeight;
  const top = labelCenterY - labelHeight / 2;
  const bottom = labelCenterY + labelHeight / 2;
  if (
    top >= LABEL_REVEAL_MARGIN &&
    bottom <= visibleBottom - LABEL_REVEAL_MARGIN
  )
    return 0;
  return Math.round(labelCenterY - visibleBottom / 2);
}

/** 확대는 두고 지도만 옮긴다(설계 5.2). 시트가 열리기 전에 불러도 시트 높이는 식으로 안다 */
export function revealLabelAboveSheet(
  map: LeafletMap,
  tooltip: Tooltip | undefined,
) {
  const latlng = tooltip?.getLatLng();
  const element = tooltip?.getElement();
  if (!latlng || !element) return;
  const offset = labelRevealOffset({
    labelCenterY: map.latLngToContainerPoint(latlng).y,
    labelHeight: element.offsetHeight,
    mapHeight: map.getSize().y,
    sheetHeight: mobileSheetHeight(window.innerHeight),
  });
  if (offset !== 0) map.panBy([0, offset], { animate: true });
}

/** 가로 좁은 화면의 옆 패널에 이름표가 가리면 지도를 왼쪽으로 옮긴다(설계 3). 패널 폭은 `detailPadding`이 안다 */
export function revealLabelBesidePanel(
  map: LeafletMap,
  tooltip: Tooltip | undefined,
) {
  const latlng = tooltip?.getLatLng();
  const element = tooltip?.getElement();
  if (!latlng || !element) return;
  const offset = labelRevealOffsetX({
    labelCenterX: map.latLngToContainerPoint(latlng).x,
    labelWidth: element.offsetWidth,
    mapWidth: map.getSize().x,
    panelWidth: detailPadding("landscape", {
      width: window.innerWidth,
      height: window.innerHeight,
    })[0],
  });
  if (offset !== 0) map.panBy([offset, 0], { animate: true });
}
