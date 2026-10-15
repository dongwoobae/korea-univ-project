"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ADMIN_MOBILE_QUERY } from "./types";

export interface DetailRemoveAction {
  confirmMessage: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}

interface DetailPanelProps {
  /** region 이름이자 모바일 상단 바 제목 */
  label: string;
  /** 데스크톱 헤더(아이콘·이름·메타). ✕는 이 틀이 붙인다 */
  header: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  remove?: DetailRemoveAction;
  save: { pending: boolean; disabled?: boolean; onClick: () => void } | null;
  /**
   * 모바일 상세 위쪽에 지도 띠를 비워 둘지. 명소처럼 미리보기가 지도가 아니면 끈다(설계 2026-10-14 2.5).
   * AdminMapWorkspace의 `mobileMapStrip`과 같은 사실이라 짝으로 맞춘다 — 끄면 그쪽을 0으로 준다.
   */
  mapStrip?: boolean;
  /** 패널을 마운트한 채 숨긴다. 모바일에서 상세를 접고 지도에서 위치를 고르거나 경로를 고치는 동안 입력과 상태를 남긴다 */
  hidden?: boolean;
  /** 하단 바 닫기 버튼 글자. 주지 않으면 데스크톱은 닫기, 모바일은 취소 */
  closeLabel?: string;
  /** 데스크톱 하단 바 왼쪽 안내 */
  footNote?: ReactNode;
  children: ReactNode;
}

export default function DetailPanel({
  label,
  header,
  onClose,
  closeDisabled = false,
  remove,
  save,
  mapStrip = true,
  hidden = false,
  closeLabel,
  footNote,
  children,
}: DetailPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const messageId = useId();

  // 삭제 버튼과 확인 칸은 서로 자리를 바꾼다. 사라진 쪽에 있던 초점은 body로 떨어지므로 나타난 쪽으로 옮긴다
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
      return;
    }
    if (!returnFocusRef.current) return;
    returnFocusRef.current = false;
    // 삭제를 기다리는 사이 사용자가 옮긴 초점은 빼앗지 않는다
    const active = document.activeElement;
    if (!active || active === document.body) triggerRef.current?.focus();
  }, [confirming]);

  function closeConfirm() {
    returnFocusRef.current = true;
    setConfirming(false);
  }

  async function confirmRemove() {
    if (!remove) return;
    setRemoving(true);
    try {
      await remove.onConfirm();
    } finally {
      setRemoving(false);
      closeConfirm();
    }
  }

  const removeControl =
    remove &&
    (confirming ? (
      <div
        className="ku-detail-remove-confirm"
        role="group"
        aria-label="삭제 확인"
        aria-describedby={messageId}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || removing) return;
          event.stopPropagation();
          closeConfirm();
        }}
      >
        <span id={messageId}>{remove.confirmMessage}</span>
        <button
          ref={cancelRef}
          type="button"
          className="ku-workspace-button"
          onClick={closeConfirm}
          disabled={removing}
        >
          취소
        </button>
        <button
          type="button"
          className="ku-workspace-button ku-workspace-button--danger"
          onClick={() => void confirmRemove()}
          disabled={removing || remove.disabled}
        >
          {removing ? "삭제 중..." : "삭제"}
        </button>
      </div>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        className="ku-detail-remove"
        onClick={() => setConfirming(true)}
        disabled={remove.disabled}
      >
        삭제
      </button>
    ));

  return (
    <section className="ku-detail-panel" aria-label={label} hidden={hidden}>
      {mobile ? (
        <div className="ku-detail-panel-bar">
          <button
            type="button"
            className="ku-detail-panel-back"
            aria-label="목록으로"
            onClick={onClose}
            disabled={closeDisabled}
          >
            ‹
          </button>
          <h2>{label}</h2>
        </div>
      ) : (
        <div className="ku-detail-panel-head">
          {header}
          <button
            type="button"
            className="ku-detail-panel-close"
            aria-label="상세 닫기"
            onClick={onClose}
            disabled={closeDisabled}
          >
            ✕
          </button>
        </div>
      )}
      {/* 모바일 상세는 이 띠로 작업 화면의 지도를 보인다(설계 2026-10-14 2.5) */}
      {mobile && mapStrip && (
        <div className="ku-detail-panel-strip" aria-hidden="true" />
      )}
      <div className="ku-detail-panel-body">
        {children}
        {mobile && removeControl}
      </div>
      <div className="ku-detail-panel-foot">
        {!mobile && removeControl}
        {!mobile && footNote && (
          <span className="ku-detail-panel-note">{footNote}</span>
        )}
        <span className="ku-detail-panel-spacer" />
        <button
          type="button"
          className="ku-workspace-button"
          onClick={onClose}
          disabled={closeDisabled}
        >
          {closeLabel ?? (mobile ? "취소" : "닫기")}
        </button>
        {save && (
          <button
            type="button"
            className="ku-workspace-primary"
            onClick={save.onClick}
            disabled={save.pending || save.disabled}
          >
            {save.pending ? "저장 중..." : "저장"}
          </button>
        )}
      </div>
    </section>
  );
}
