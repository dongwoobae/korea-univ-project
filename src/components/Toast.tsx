"use client";

import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";

const STYLES = {
  success: {
    bg: "#F0FDF4",
    border: "#86EFAC",
    color: "#166534",
    Icon: CircleCheck,
  },
  error: { bg: "#FEF2F2", border: "#FCA5A5", color: "#991B1B", Icon: CircleX },
  warning: {
    bg: "#FFFBEB",
    border: "#FCD34D",
    color: "#92400E",
    Icon: TriangleAlert,
  },
};

// 호출부가 STYLES에 없는 값(예: "info")도 넘긴다. 좁은 유니온으로 조이면
// 그 호출부가 깨지므로 string으로 받고 아래 조회에서 success로 떨어뜨린다.
export default function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: string;
  onClose: () => void;
}) {
  const s = STYLES[type as keyof typeof STYLES] ?? STYLES.success;

  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div
      className="ku-toast"
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 10,
        padding: "14px 24px", // ← 패딩 키움
        fontSize: 15, // ← 폰트 키움
        color: s.color,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 280, // ← minWidth 키움
        maxWidth: 700, // ← maxWidth 키움
        whiteSpace: "normal", // ← nowrap → normal로 변경 (텍스트 줄바꿈 허용)
        wordBreak: "keep-all", // ← 한국어 단어 단위로 줄바꿈
      }}
    >
      <s.Icon size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        style={{
          display: "flex",
          alignItems: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: s.color,
          opacity: 0.6,
          padding: 0,
        }}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
