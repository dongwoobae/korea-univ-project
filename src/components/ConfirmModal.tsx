"use client";

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
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 320,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#111",
            marginBottom: description ? 8 : 20,
          }}
        >
          {message}
        </div>
        {description && (
          <div
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
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
