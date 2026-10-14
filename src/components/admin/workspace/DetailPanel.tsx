"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ADMIN_MOBILE_QUERY } from "./types";

interface DetailPanelProps {
  /** region 이름이자 모바일 상단 바 제목 */
  label: string;
  /** 데스크톱 헤더(아이콘·이름·메타). ✕는 이 틀이 붙인다 */
  header: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  remove?: {
    confirmMessage: string;
    disabled?: boolean;
    onConfirm: () => Promise<void>;
  };
  save: { pending: boolean; disabled?: boolean; onClick: () => void } | null;
  children: ReactNode;
}

export default function DetailPanel({
  label,
  header,
  onClose,
  closeDisabled = false,
  remove,
  save,
  children,
}: DetailPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 삭제 버튼이 확인으로 바뀌면 초점이 갈 곳을 잃는다
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function confirmRemove() {
    if (!remove) return;
    setRemoving(true);
    try {
      await remove.onConfirm();
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  const removeControl =
    remove &&
    (confirming ? (
      <div
        className="ku-detail-remove-confirm"
        role="group"
        aria-label="삭제 확인"
      >
        <span>{remove.confirmMessage}</span>
        <button
          ref={cancelRef}
          type="button"
          className="ku-workspace-button"
          onClick={() => setConfirming(false)}
          disabled={removing}
        >
          취소
        </button>
        <button
          type="button"
          className="ku-workspace-button ku-workspace-button--danger"
          onClick={() => void confirmRemove()}
          disabled={removing}
        >
          {removing ? "삭제 중..." : "삭제"}
        </button>
      </div>
    ) : (
      <button
        type="button"
        className="ku-detail-remove"
        onClick={() => setConfirming(true)}
        disabled={remove.disabled}
      >
        삭제
      </button>
    ));

  return (
    <section className="ku-detail-panel" aria-label={label}>
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
      {mobile && <div className="ku-detail-panel-strip" aria-hidden="true" />}
      <div className="ku-detail-panel-body">
        {children}
        {mobile && removeControl}
      </div>
      <div className="ku-detail-panel-foot">
        {!mobile && removeControl}
        <span className="ku-detail-panel-spacer" />
        <button
          type="button"
          className="ku-workspace-button"
          onClick={onClose}
          disabled={closeDisabled}
        >
          {mobile ? "취소" : "닫기"}
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
