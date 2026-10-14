"use client";

import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";

const ICONS = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
};

type ToastTone = keyof typeof ICONS;

// 호출부가 ICONS에 없는 값(예: "info")도 넘긴다. 좁은 유니온으로 조이면
// 그 호출부가 깨지므로 string으로 받고 여기서 success로 떨어뜨린다.
function toneOf(type: string): ToastTone {
  return Object.hasOwn(ICONS, type) ? (type as ToastTone) : "success";
}

/** 모양은 globals.css(공개)와 admin-ui.css의 .ku-admin-shell 범위(관리자)가 정한다(설계 2026-10-14 2.12) */
export default function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: string;
  onClose: () => void;
}) {
  const tone = toneOf(type);
  const Icon = ICONS[tone];

  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div
      className="ku-toast"
      data-tone={tone}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon size={18} aria-hidden="true" className="ku-toast-icon" />
      <span className="ku-toast-message">{message}</span>
      <button
        type="button"
        className="ku-toast-close"
        onClick={onClose}
        aria-label="알림 닫기"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
