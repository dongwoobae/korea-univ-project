"use client";

import { useId } from "react";
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
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose: onCancel,
    closeOnEscape: !pending,
  });

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
      onClick={pending ? undefined : onCancel}
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
        <div className="ku-admin-confirm-actions" style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: pending ? "not-allowed" : "pointer",
              color: "#555",
              opacity: pending ? 0.65 : 1,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{
              flex: 1,
              padding: "10px",
              background: confirmColor,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: pending ? "wait" : "pointer",
              fontWeight: 500,
              opacity: pending ? 0.75 : 1,
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
