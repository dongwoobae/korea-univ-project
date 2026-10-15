import L from "leaflet";
import type {
  WorkspaceFocusTarget,
  WorkspaceInsets,
  WorkspaceMapCommands,
} from "./types";

/** 작업 화면 지도 자리에 번갈아 끼우는 지도들(보기·경사도 편집)이 같은 최대 줌을 써야 viewport를 이어받는다 */
export const WORKSPACE_MAX_ZOOM = 19;
/** 멀리서 고른 항목은 이만큼은 당겨서 보인다 */
const FOCUS_MIN_ZOOM = 17;

function focusWorkspaceMap(
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

/**
 * 작업 화면 지도(보기 지도와 경사도 편집 지도)가 onCommandsReady로 등록하는 명령.
 * dispose는 지도를 remove()한 뒤에 부른다 — remove() 중에 오는 moveend와 unload를 여기서 받아야 한다.
 */
export function bindWorkspaceMapCommands(map: L.Map): {
  commands: WorkspaceMapCommands;
  dispose: () => void;
} {
  let disposed = false;
  let moving = false;
  const settle = () => {
    // remove()는 진행 중인 팬을 멈추며 moveend를 낸다. 목표에 닿은 것이 아니다. React는 지운 DOM을 떼어 낸 뒤 effect
    // 정리를 부르므로 그때 컨테이너는 문서 밖이다
    if (map.getContainer().isConnected) moving = false;
  };
  const unload = () => {
    disposed = true;
    // Leaflet 1.9.4의 remove()는 줌 애니메이션(_animateZoom)이 건 타이머를 지우지 않아, 그 타이머가 지운 지도 판의
    // 위치를 읽다 미처리 예외를 던진다. 진행 중 표시를 끄면 타이머가 바로 돌아간다. 비공개 필드라 Leaflet을 올릴 때 다시 본다
    (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
  };
  map.on("moveend", settle);
  map.on("unload", unload);
  return {
    commands: {
      focus(target, insets) {
        if (disposed) return false;
        moving = true;
        focusWorkspaceMap(map, target, insets);
        return true;
      },
      moving: () => moving,
    },
    dispose() {
      disposed = true;
      map.off("moveend", settle);
      map.off("unload", unload);
    },
  };
}
