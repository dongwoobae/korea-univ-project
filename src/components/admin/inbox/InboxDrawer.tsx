"use client";

import type { ReactNode, RefObject } from "react";
import { useModalFocus } from "@/lib/useModalFocus";

interface InboxDrawerProps {
  /** 헤더 안 제목 요소의 id. dialog 이름이 된다 */
  titleId: string;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  /** ✕·배경·Esc가 모두 이 하나를 부른다. 막을지(바쁨·저장 안 한 변경)는 부르는 쪽이 정한다 */
  onRequestClose: () => void;
  /** Esc가 닫기를 부를지. 안쪽 인라인 확인이 먼저 Esc를 받을 때 끈다 */
  closeOnEscape: boolean;
  restoreFallbackRef?: RefObject<HTMLElement | null>;
}

/**
 * 제보함 검토 드로어의 껍데기. 배경과 패널은 같은 층 안의 형제라 패널 안 클릭이 배경으로 번지지 않는다.
 * 열고 닫는 트랜지션은 두지 않는다.
 */
export default function InboxDrawer({
  titleId,
  header,
  footer,
  children,
  onRequestClose,
  closeOnEscape,
  restoreFallbackRef,
}: InboxDrawerProps) {
  const dialogRef = useModalFocus<HTMLElement>({
    onClose: onRequestClose,
    closeOnEscape,
    restoreFallbackRef,
  });

  return (
    <div className="ku-inbox-drawer-layer">
      <div
        className="ku-inbox-drawer-dim"
        data-testid="inbox-drawer-dim"
        aria-hidden="true"
        onClick={onRequestClose}
      />
      <section
        ref={dialogRef}
        className="ku-inbox-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ku-inbox-drawer-head">
          <div className="ku-inbox-drawer-head-main">{header}</div>
          <button
            type="button"
            className="ku-inbox-drawer-close"
            aria-label="닫기"
            onClick={onRequestClose}
          >
            ✕
          </button>
        </div>
        <div className="ku-inbox-drawer-body">{children}</div>
        <div className="ku-inbox-drawer-foot">{footer}</div>
      </section>
    </div>
  );
}
