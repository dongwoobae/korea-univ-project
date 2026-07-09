"use client";

import { useEffect } from "react";

const STYLES = {
  success: { bg: "#F0FDF4", border: "#86EFAC", color: "#166534", icon: "✅" },
  error: { bg: "#FEF2F2", border: "#FCA5A5", color: "#991B1B", icon: "❌" },
  warning: { bg: "#FFFBEB", border: "#FCD34D", color: "#92400E", icon: "⚠️" },
};

export default function Toast({ message, type = "success", onClose }) {
  const s = STYLES[type] ?? STYLES.success;

  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div
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
      <span>{s.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          color: s.color,
          opacity: 0.6,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
