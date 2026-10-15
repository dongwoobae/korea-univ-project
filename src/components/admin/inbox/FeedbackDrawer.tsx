"use client";

import { useId, useState, type RefObject } from "react";
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard";
import { useWorkspaceCloseRequest } from "@/components/admin/workspace/useWorkspaceSelection";
import { formatAdminReceivedSuffix } from "@/lib/adminList";
import { authedFetch } from "@/lib/authedFetch";
import { FEEDBACK_TYPES } from "@/lib/feedback";
import { feedbackPageHref } from "@/lib/inboxBoard";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/inboxStatus";
import InboxDrawer from "./InboxDrawer";

const TYPE_LABELS = new Map<string, string>(
  FEEDBACK_TYPES.map((type) => [type.value, type.label]),
);

const STATUSES = Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[];

const SAVED_TOAST: Record<FeedbackStatus, string> = {
  new: "신규로 되돌렸어요",
  reviewing: "확인 중으로 바꿨어요",
  resolved: "처리 완료로 바꿨어요",
};

interface FeedbackDrawerProps {
  /** 페이지가 들고 있는 항목. 상태를 바꿔 보드에서 빠져도 이 값을 보인다 */
  item: FeedbackItem;
  /** 확인 없이 드로어를 닫는다. 닫기 요청(바쁨)은 이 드로어가 정한다 */
  onClose: () => void;
  /** 저장에 성공했을 때 페이지가 들고 있는 항목의 상태를 바꾼다 */
  onStatusSaved: (status: FeedbackStatus) => void;
  /** 성공·실패 모두 보드를 다시 받게 한다 */
  onChanged: () => void;
  showToast: (message: string, type?: string) => void;
  restoreFallbackRef: RefObject<HTMLElement | null>;
  /** 같은 열의 다음 카드가 있을 때만 준다 */
  onNext?: () => void;
}

export default function FeedbackDrawer({
  item,
  onClose,
  onStatusSaved,
  onChanged,
  showToast,
  restoreFallbackRef,
  onNext,
}: FeedbackDrawerProps) {
  const titleId = useId();
  const { guard } = useUnsavedChangesGuard();
  const [busy, setBusy] = useState(false);

  // 피드백에는 고칠 값이 없어 저장 안 한 변경을 등록하지 않는다. 바쁜 동안만 닫지 않는다.
  const requestDrawerClose = () => {
    if (!busy) guard(onClose);
  };
  useWorkspaceCloseRequest(true, requestDrawerClose);

  async function changeStatus(status: FeedbackStatus) {
    if (busy || status === item.status) return;
    setBusy(true);
    try {
      const response = await authedFetch(`/api/admin-feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => null);
      if (response?.ok) {
        onStatusSaved(status);
        showToast(SAVED_TOAST[status]);
      } else {
        showToast("상태를 바꾸지 못했어요", "error");
      }
      // 실패해도 다시 읽는다. 서버 값과 어긋난 채로 보드가 남지 않게 한다.
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = TYPE_LABELS.get(item.feedback_type) ?? item.feedback_type;
  // 드로어는 카드를 누른 뒤에만 그려지므로 서버 렌더·하이드레이션과 만나지 않는다.
  const href = item.page_url
    ? feedbackPageHref(item.page_url, window.location.origin)
    : null;

  const header = (
    <div className="ku-inbox-drawer-title">
      <div>
        <h2 id={titleId} className="ku-inbox-feedback-title">
          <span className="ku-inbox-kind-tag">{typeLabel}</span>
        </h2>
        <p>{formatAdminReceivedSuffix(item.created_at)}</p>
      </div>
    </div>
  );

  const footer = (
    <>
      <span className="ku-inbox-foot-label">처리 상태</span>
      <div
        className="ku-detail-segment ku-inbox-status-segment"
        role="group"
        aria-label="처리 상태"
      >
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            data-status={status}
            aria-pressed={item.status === status}
            disabled={busy}
            onClick={() => void changeStatus(status)}
          >
            {FEEDBACK_STATUS_LABELS[status]}
          </button>
        ))}
      </div>
      <span className="ku-detail-panel-spacer" />
      {onNext && (
        <button
          type="button"
          className="ku-workspace-button"
          disabled={busy}
          onClick={onNext}
        >
          다음 항목 →
        </button>
      )}
    </>
  );

  return (
    <InboxDrawer
      titleId={titleId}
      header={header}
      footer={footer}
      onRequestClose={requestDrawerClose}
      closeOnEscape={!busy}
      restoreFallbackRef={restoreFallbackRef}
    >
      <p className="ku-inbox-feedback-content" data-testid="feedback-content">
        {item.content}
      </p>
      {item.page_url && (
        <div className="ku-inbox-feedback-page">
          보낸 화면{" "}
          {href ? (
            <a href={href}>{item.page_url}</a>
          ) : (
            <span>{item.page_url}</span>
          )}
        </div>
      )}
    </InboxDrawer>
  );
}
