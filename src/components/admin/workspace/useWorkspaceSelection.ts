"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard";
import {
  readWorkspaceState,
  writeWorkspaceState,
  type WorkspaceState,
} from "@/lib/workspaceUrl";

const URL_CHANGED = "ku:workspace-url";
const CLOSE_REQUESTED = "ku:workspace-close";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_CHANGED, onChange);
  };
}

function readSearch() {
  return window.location.search;
}

function readServerSearch() {
  return "";
}

/**
 * 확인 없이 바로 적용한다. 저장·삭제가 끝난 뒤, 없는 ?id= 정리처럼 이미 정해진 이동에만 쓴다.
 * alsoApply(페이지·칩 변경 등)는 URL과 같은 틱에 적용돼 한 번에 그려진다.
 */
export function applyWorkspaceState(
  next: WorkspaceState,
  alsoApply?: () => void,
) {
  const search = writeWorkspaceState(window.location.search, next);
  if (search !== window.location.search) {
    // useSearchParams는 Suspense 경계를 요구한다. 제보함 페이지처럼 location을 직접 다룬다.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
    window.dispatchEvent(new Event(URL_CHANGED));
  }
  alsoApply?.();
}

/** URL이 선택의 원본이다. 뒤로가기로 바뀐 URL도 popstate로 따라온다 */
export function useWorkspaceSelection(options: { allowEdit: boolean }) {
  const search = useSyncExternalStore(subscribe, readSearch, readServerSearch);
  const state = readWorkspaceState(search, options);
  const { guard } = useUnsavedChangesGuard();

  // 확인 전에는 선택·페이지·URL 어느 것도 바꾸지 않고, 승인되면 한 번에 적용한다(설계 2026-10-14 3.4)
  function request(next: WorkspaceState, alsoApply?: () => void) {
    guard(() => applyWorkspaceState(next, alsoApply));
  }

  return { state, request };
}

/**
 * 헤더의 같은 화면 링크가 부른다. 화면이 자기 닫기로 받아 저장 잠금과 가드를 거친다(설계 2026-10-14 3.4).
 * 받은 화면이 있으면 true
 */
export function requestWorkspaceClose() {
  return !window.dispatchEvent(
    new Event(CLOSE_REQUESTED, { cancelable: true }),
  );
}

/** 선택이 열려 있는 동안 requestWorkspaceClose를 받아 close를 부른다 */
export function useWorkspaceCloseRequest(open: boolean, close: () => void) {
  const onClose = useEffectEvent(close);

  useEffect(() => {
    if (!open) return;
    function handle(event: Event) {
      event.preventDefault();
      onClose();
    }
    window.addEventListener(CLOSE_REQUESTED, handle);
    return () => window.removeEventListener(CLOSE_REQUESTED, handle);
  }, [open]);
}
