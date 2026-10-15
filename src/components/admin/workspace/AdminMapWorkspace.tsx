"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  ADMIN_MOBILE_QUERY,
  ADMIN_NARROW_QUERY,
  DEFAULT_WORKSPACE_VIEWPORT,
  workspaceInsets,
  type WorkspaceFocus,
  type WorkspaceMapCommands,
  type WorkspaceMapSlotProps,
  type WorkspaceViewport,
} from "./types";

interface AdminMapWorkspaceProps {
  /** 지도는 탭이 만든다. 이 틀은 viewport와 명령 등록 콜백만 건넨다 */
  renderMap: (slot: WorkspaceMapSlotProps) => ReactNode;
  list: ReactNode;
  detail: ReactNode | null;
  focus: WorkspaceFocus | null;
  /**
   * 모바일 상세가 위쪽에 비워 두는 지도 띠의 높이(설계 2026-10-14 2.5).
   * DetailPanel의 `mapStrip`과 같은 사실이라 짝으로 맞춘다 — 상세가 띠를 끄면 0을 준다.
   */
  mobileMapStrip?: number;
  /** 모바일 상세를 접고 지도에서 위치를 고르거나 경로를 고치는 중. 지도를 옮길 때 아래 확인 바와 `mobilePickingTop`을 비킨다 */
  mobilePicking?: boolean;
  /** 고르는 동안 지도 위쪽을 덮는 막대(경사도 도구 바)의 아래 끝. 지도 위쪽에서 잰다 */
  mobilePickingTop?: number;
}

export default function AdminMapWorkspace({
  renderMap,
  list,
  detail,
  focus,
  mobileMapStrip = 190,
  mobilePicking = false,
  mobilePickingTop = 0,
}: AdminMapWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 지도를 바꿔 끼울 때(경사도 편집, 설계 2026-10-14 2.6) 새 지도가 이어받을 마지막 화면
  const [viewport, setViewport] = useState<WorkspaceViewport>(
    DEFAULT_WORKSPACE_VIEWPORT,
  );
  const [commands, setCommands] = useState<WorkspaceMapCommands | null>(null);
  const focusedRef = useRef<{
    key: string;
    commands: WorkspaceMapCommands;
  } | null>(null);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const narrow = useMediaQuery(ADMIN_NARROW_QUERY);
  const detailOpen = detail !== null;

  useEffect(() => {
    if (!focus) {
      focusedRef.current = null;
      return;
    }
    if (!commands) return;
    const focused = focusedRef.current;
    // 바꿔 끼운 지도는 앞 지도가 moveend로 알린 마지막 화면으로 열린다. 앞 지도가 이 key로 옮기다 정리됐으면 그 화면은
    // 옮기기 전 자리라 새 지도에서 다시 맞추고, 다 옮겼으면 그 뒤 손으로 옮긴 화면까지 그대로 이어받는다(설계 2026-10-14 3.2)
    if (
      focused?.key === focus.key &&
      (focused.commands === commands || !focused.commands.moving())
    )
      return;
    const applied = commands.focus(
      focus.target,
      workspaceInsets({
        mobile,
        narrow,
        detailOpen,
        height: rootRef.current?.clientHeight ?? 0,
        mapStrip: mobileMapStrip,
        picking: mobilePicking,
        pickingTop: mobilePickingTop,
      }),
    );
    // 지도를 바꿔 끼우는 커밋에서는 렌더 때 받은 commands가 막 정리된 지도의 것이라 명령이 버려진다.
    // 그때 key를 적어 두면 새 지도가 명령을 등록한 뒤에도 옮기지 않으므로, 옮겼을 때만 적는다
    if (applied) focusedRef.current = { key: focus.key, commands };
  }, [
    commands,
    focus,
    mobile,
    narrow,
    detailOpen,
    mobileMapStrip,
    mobilePicking,
    mobilePickingTop,
  ]);

  return (
    <div
      ref={rootRef}
      className="ku-map-workspace"
      data-detail-open={detailOpen || undefined}
      style={{ "--ku-map-strip": `${mobileMapStrip}px` } as CSSProperties}
    >
      <div className="ku-map-workspace-map">
        {renderMap({
          initialViewport: viewport,
          onViewportChange: setViewport,
          onCommandsReady: setCommands,
        })}
      </div>
      {list}
      {detail}
    </div>
  );
}
