"use client";

import { useId, useRef } from "react";
import { useModalFocus } from "@/lib/useModalFocus";
import FacilityInstallationControl from "@/components/admin/FacilityInstallationControl";
import FacilityTranslationControl from "@/components/admin/FacilityTranslationControl";
import type { FacilityWithType } from "@/types/domain";

interface FacilityDetailModalProps {
  facility: FacilityWithType;
  toggling: boolean;
  onToggleInstalled: () => void;
  onTranslated: () => void | Promise<void>;
  onRequestDelete: () => void;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityDetailModal({
  facility,
  toggling,
  onToggleInstalled,
  onTranslated,
  onRequestDelete,
  onClose,
  showToast,
}: FacilityDetailModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  });
  const title = facility.name ?? facility.facility_types?.label ?? "시설";

  return (
    <div
      ref={dialogRef}
      className="ku-facility-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="ku-facility-modal"
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "min(420px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          id={titleId}
          style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}
        >
          {title}
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">상태</span>
          <FacilityInstallationControl
            installed={facility.is_installed}
            pending={toggling}
            onToggle={onToggleInstalled}
          />
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">번역</span>
          <FacilityTranslationControl
            facility={facility}
            onTranslated={onTranslated}
            showToast={showToast}
          />
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">위치</span>
          <span style={{ fontSize: 12, color: "var(--ku-text-3)" }}>
            {facility.lat
              ? `위도 ${facility.lat} / 경도 ${facility.lng}`
              : "좌표 없음"}
          </span>
        </div>

        {/* 인라인으로 같은 모양을 재현하면 모바일의 sticky 배치와 최소 터치
            높이(admin-ui.css의 미디어쿼리)가 안 걸린다. 클래스를 쓴다. */}
        <div className="ku-facility-modal-actions">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              color: "#555",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="ku-admin-row-action ku-admin-row-action--danger"
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #DC2626",
              borderRadius: 8,
              fontSize: 13,
              color: "#DC2626",
              cursor: "pointer",
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
