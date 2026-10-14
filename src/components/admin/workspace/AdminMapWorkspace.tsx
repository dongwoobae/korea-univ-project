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
  /** 모바일 상세가 위쪽에 비워 두는 지도 띠의 높이(설계 2026-10-14 2.5) */
  mobileMapStrip?: number;
}

export default function AdminMapWorkspace({
  renderMap,
  list,
  detail,
  focus,
  mobileMapStrip = 190,
}: AdminMapWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 지도를 바꿔 끼울 때(경사도 편집, 설계 2026-10-14 2.6) 새 지도가 이어받을 마지막 화면
  const [viewport, setViewport] = useState<WorkspaceViewport>(
    DEFAULT_WORKSPACE_VIEWPORT,
  );
  const [commands, setCommands] = useState<WorkspaceMapCommands | null>(null);
  const focusedKeyRef = useRef<string | null>(null);
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const narrow = useMediaQuery(ADMIN_NARROW_QUERY);
  const detailOpen = detail !== null;

  useEffect(() => {
    if (!focus) {
      focusedKeyRef.current = null;
      return;
    }
    if (!commands || focusedKeyRef.current === focus.key) return;
    focusedKeyRef.current = focus.key;
    commands.focus(
      focus.target,
      workspaceInsets({
        mobile,
        narrow,
        detailOpen,
        height: rootRef.current?.clientHeight ?? 0,
        mapStrip: mobileMapStrip,
      }),
    );
  }, [commands, focus, mobile, narrow, detailOpen, mobileMapStrip]);

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
