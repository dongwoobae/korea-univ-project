"use client";

import { useId, useState } from "react";
import { useModalFocus } from "@/lib/useModalFocus";

interface ConfirmModalProps {
  message: string;
  description?: string;
  confirmLabel?: string;
  confirmColor?: string;
  pending?: boolean;
  pendingLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  message,
  description,
  confirmLabel = "삭제",
  confirmColor = "#DC2626",
  pending = false,
  pendingLabel = "처리 중...",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  // onConfirm이 Promise를 반환하면 완료까지 내부적으로 pending 처리해
  // 진행 중 Escape·백드롭 닫기와 중복 실행을 막는다. 외부 pending과 병행 가능.
  const [internalPending, setInternalPending] = useState(false);
  const busy = pending || internalPending;
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: onCancel,
    closeOnEscape: !busy,
  });

  function handleConfirm() {
    const result = onConfirm();
    if (result instanceof Promise) {
      setInternalPending(true);
      result.finally(() => setInternalPending(false));
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 320,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#111",
            marginBottom: description ? 8 : 20,
            marginTop: 0,
          }}
        >
          {message}
        </h2>
        {description && (
          <div
            id={descriptionId}
            style={{
              fontSize: 13,
              color: "#888",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        )}
        <div
          className="ku-admin-confirm-actions"
          style={{ display: "flex", gap: 8 }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer",
              color: "#555",
              opacity: busy ? 0.65 : 1,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px",
              background: confirmColor,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: busy ? "wait" : "pointer",
              fontWeight: 500,
              opacity: busy ? 0.75 : 1,
            }}
          >
            {busy ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
