"use client";

import { useId } from "react";
import { formatAdminReceivedAt } from "@/lib/adminList";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/inboxStatus";
import { useModalFocus } from "@/lib/useModalFocus";

interface FeedbackDetailModalProps {
  item: FeedbackItem;
  typeLabel: string;
  pending: boolean;
  onStatusChange: (status: FeedbackStatus) => void;
  onClose: () => void;
}

// 공개 제출값이다. 제출 API가 http(s)만 받지만 관리자 화면의 링크는 여기서도 거른다.
function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function FeedbackDetailModal({
  item,
  typeLabel,
  pending,
  onStatusChange,
  onClose,
}: FeedbackDetailModalProps) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({ onClose });

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
          width: "min(560px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div id={titleId} className="ku-review-modal-title">
          {typeLabel}
        </div>
        <div className="ku-review-modal-meta">
          <span>{formatAdminReceivedAt(item.created_at)}</span>
          {item.page_url && isWebUrl(item.page_url) && (
            <a href={item.page_url} target="_blank" rel="noreferrer">
              제보한 페이지
            </a>
          )}
        </div>
        <p className="ku-feedback-detail-content">{item.content}</p>
        <div className="ku-facility-modal-actions ku-review-actions">
          <select
            className="ku-feedback-detail-status"
            aria-label="처리 상태"
            value={item.status}
            disabled={pending}
            onChange={(event) =>
              onStatusChange(event.target.value as FeedbackStatus)
            }
          >
            {(Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]).map(
              (status) => (
                <option key={status} value={status}>
                  {FEEDBACK_STATUS_LABELS[status]}
                </option>
              ),
            )}
          </select>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
