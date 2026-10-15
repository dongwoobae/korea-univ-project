import L from "leaflet";
import type { WorkspaceFocusTarget, WorkspaceInsets } from "./types";

/** 작업 화면 지도 자리에 번갈아 끼우는 지도들(보기·경사도 편집)이 같은 최대 줌을 써야 viewport를 이어받는다 */
export const WORKSPACE_MAX_ZOOM = 19;
/** 멀리서 고른 항목은 이만큼은 당겨서 보인다 */
const FOCUS_MIN_ZOOM = 17;

export function focusWorkspaceMap(
  map: L.Map,
  target: WorkspaceFocusTarget,
  insets: WorkspaceInsets,
): void {
  const isPoint = "point" in target;
  const bounds = isPoint
    ? L.latLngBounds(target.point, target.point)
    : L.latLngBounds(target.bounds);
  map.fitBounds(bounds, {
    paddingTopLeft: [insets.left, insets.top],
    paddingBottomRight: [insets.right, insets.bottom],
    maxZoom: isPoint
      ? Math.max(map.getZoom(), FOCUS_MIN_ZOOM)
      : WORKSPACE_MAX_ZOOM,
  });
}
