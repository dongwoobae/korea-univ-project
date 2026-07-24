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
  onClose: () => void;
}

export function useModalFocus<T extends HTMLElement>({
  active = true,
  closeOnEscape = true,
  initialFocusRef,
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, initialFocusRef]);

  return dialogRef;
}
