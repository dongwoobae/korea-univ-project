export type LatLngTuple = [number, number];

export interface WorkspaceViewport {
  center: LatLngTuple;
  zoom: number;
}

export interface WorkspaceInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type WorkspaceFocusTarget =
  { point: LatLngTuple } | { bounds: [LatLngTuple, LatLngTuple] };

/** key가 바뀔 때만 지도를 옮긴다. 같은 항목의 초안 핀을 옮기는 동안 지도가 따라가지 않게 한다 */
export interface WorkspaceFocus {
  key: string;
  target: WorkspaceFocusTarget;
}

export interface WorkspaceMapCommands {
  focus: (target: WorkspaceFocusTarget, insets: WorkspaceInsets) => void;
}

/**
 * next/dynamic(ssr:false)로 불러온 지도는 ref를 부모에 넘기지 않는다. 명령은 객체 하나로
 * onCommandsReady에 등록하고, 지도가 정리될 때 null로 거둔다(설계 2026-10-14 3.2).
 */
export interface WorkspaceMapSlotProps {
  initialViewport: WorkspaceViewport;
  onViewportChange: (viewport: WorkspaceViewport) => void;
  onCommandsReady: (commands: WorkspaceMapCommands | null) => void;
}

/**
 * 상세 패널이 지도에 맡기는 초안 핀. owner가 지금 열린 패널과 다르면 낡은 것이다 —
 * 패널이 바뀐 뒤 늦게 끝난 저장의 잠금이 남지 않게 한다(설계 2026-10-14 3.4).
 */
export interface DetailDraftPin {
  owner: string;
  position: LatLngTuple | null;
  setPosition: (position: LatLngTuple) => void;
  saving: boolean;
}

export const ADMIN_MOBILE_QUERY = "(max-width: 767px)";

export const DEFAULT_WORKSPACE_VIEWPORT: WorkspaceViewport = {
  center: [37.5893, 127.0327],
  zoom: 17,
};

// admin-ui.css의 .ku-float-panel·.ku-detail-panel 폭·여백과 모바일 .ku-detail-panel-bar 높이에 맞춘다.
const PANEL_GAP = 16;
const LIST_PANEL_WIDTH = 404;
const DETAIL_PANEL_WIDTH = 460;
const MOBILE_DETAIL_BAR = 52;

/** 선택한 항목을 패널 밑이 아닌 곳에 놓는 여백(핸드오버 "지도 가시 영역") */
export function workspaceInsets(options: {
  mobile: boolean;
  detailOpen: boolean;
  height: number;
  mapStrip: number;
}): WorkspaceInsets {
  if (options.mobile) {
    // 모바일에서 선택하면 상세가 위쪽 띠만 남기고 덮는다(설계 2026-10-14 2.5)
    return {
      top: MOBILE_DETAIL_BAR,
      right: 0,
      bottom: Math.max(
        0,
        options.height - MOBILE_DETAIL_BAR - options.mapStrip,
      ),
      left: 0,
    };
  }
  return {
    top: PANEL_GAP,
    right: options.detailOpen
      ? PANEL_GAP + DETAIL_PANEL_WIDTH + PANEL_GAP
      : PANEL_GAP,
    bottom: PANEL_GAP,
    left: PANEL_GAP + LIST_PANEL_WIDTH + PANEL_GAP,
  };
}
