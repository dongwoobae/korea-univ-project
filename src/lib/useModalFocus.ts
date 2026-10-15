"use client";

import { useEffect, useRef, type RefObject } from "react";

const dialogStack: HTMLElement[] = [];
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      element.getClientRects().length > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      element.getAttribute("aria-hidden") !== "true"
    );
  });
}

interface UseModalFocusOptions {
  active?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 돌아갈 요소가 사라졌고 남은 모달도 없을 때 초점을 둘 곳 */
  restoreFallbackRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function useModalFocus<T extends HTMLElement>({
  active = true,
  closeOnEscape = true,
  initialFocusRef,
  restoreFallbackRef,
  onClose,
}: UseModalFocusOptions) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!active || !dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // 돌아갈 곳은 모달이 열릴 때 이미 있는 요소다. 닫을 때 ref를 다시 읽지 않는다.
    const restoreFallback = restoreFallbackRef?.current ?? null;
    const addedTabIndex = !dialog.hasAttribute("tabindex");
    if (addedTabIndex) dialog.setAttribute("tabindex", "-1");
    dialogStack.push(dialog);

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus =
        initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
      initialFocus.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (dialogStack.at(-1) !== dialog) return;

      if (event.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      // 초점이 모달 밖에 있으면(예: 초점을 갖던 요소가 제거된 직후) 모달 안으로 되돌린다
      if (!current || !dialog.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const stackIndex = dialogStack.lastIndexOf(dialog);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      if (addedTabIndex) dialog.removeAttribute("tabindex");
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        // 복귀 대상이 사라졌으면(예: 삭제 성공으로 실행 버튼 제거) 남은 최상단 모달로 복귀
        const nextDialog = dialogStack.at(-1);
        if (nextDialog?.isConnected) {
          (focusableElements(nextDialog)[0] ?? nextDialog).focus();
        } else if (restoreFallback?.isConnected) {
          restoreFallback.focus();
        }
      }
    };
  }, [active, initialFocusRef, restoreFallbackRef]);

  return dialogRef;
}
