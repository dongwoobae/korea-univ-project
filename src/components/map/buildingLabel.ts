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
