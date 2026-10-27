"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  MENU_PANEL_ID,
  MENU_PANELS,
  menuLayout,
  readMenuCollapsed,
  writeMenuCollapsed,
  type MenuPanel,
} from "./mapMenu";

const storage = () => window.localStorage;

const FOCUSABLE =
  "input:not([disabled]), button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex='-1'])";

function panelRoot(panel: MenuPanel) {
  return document.getElementById(MENU_PANEL_ID[panel]);
}

function focusPanel(panel: MenuPanel) {
  const root = panelRoot(panel);
  (root?.querySelector<HTMLElement>(FOCUSABLE) ?? root)?.focus();
}

/** 열린 패널 하나와 접힘. 설계: docs/specs/2026-10-27-map-menu-design.md 5장 */
export function useMapMenu(isMobile: boolean) {
  const [openPanel, setOpenPanel] = useState<MenuPanel | null>(null);
  const [collapsed, setCollapsedState] = useState(() =>
    readMenuCollapsed(storage),
  );
  const openPanelRef = useRef<MenuPanel | null>(null);
  const triggers = useRef<Partial<Record<MenuPanel, HTMLElement | null>>>({});
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const layout = menuLayout(isMobile, collapsed);

  useEffect(() => {
    openPanelRef.current = openPanel;
  }, [openPanel]);

  const triggerRefs = useMemo(
    () =>
      Object.fromEntries(
        MENU_PANELS.map((panel) => [
          panel,
          (element: HTMLElement | null) => {
            triggers.current[panel] = element;
          },
        ]),
      ) as Record<MenuPanel, (element: HTMLElement | null) => void>,
    [],
  );

  // 손 안에서 그리고 초점을 준다. iOS는 효과·타이머에서 준 초점으로 화상 키보드를 띄우지 않는다(설계 5.4)
  function toggle(panel: MenuPanel) {
    if (openPanel === panel) {
      setOpenPanel(null);
      return;
    }
    flushSync(() => setOpenPanel(panel));
    focusPanel(panel);
  }

  function closeAndRestoreFocus() {
    const panel = openPanel;
    setOpenPanel(null);
    if (panel) triggers.current[panel]?.focus();
  }

  const dismiss = useCallback(() => setOpenPanel(null), []);

  function setCollapsed(next: boolean) {
    writeMenuCollapsed(storage, next);
    flushSync(() => {
      setCollapsedState(next);
      setOpenPanel(null);
    });
    (next ? expandButtonRef : collapseButtonRef).current?.focus();
  }

  // 회전·창 크기 변경은 사용자가 다른 곳을 누른 것이 아니다. 패널 안에 있던 초점을 새 모드의 같은 자리로 옮긴다
  const handleBreakpoint = useCallback((apply: () => void) => {
    const panel = openPanelRef.current;
    const hadFocus = Boolean(
      panel && panelRoot(panel)?.contains(document.activeElement),
    );
    flushSync(() => {
      apply();
      setOpenPanel(null);
    });
    if (!panel || !hadFocus) return;
    const trigger = triggers.current[panel];
    if (trigger) trigger.focus();
    else focusPanel(panel);
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    // 언어 목록·범례 툴팁·모달처럼 Esc를 먼저 쓴 곳은 preventDefault로 표시한다. window 버블이 그보다 늦다
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpenPanel(null);
      if (openPanel) triggers.current[openPanel]?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPanel]);

  return {
    layout,
    openPanel,
    toggle,
    closeAndRestoreFocus,
    dismiss,
    setCollapsed,
    handleBreakpoint,
    triggerRefs,
    collapseButtonRef,
    expandButtonRef,
  };
}
