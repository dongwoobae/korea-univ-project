"use client";

import { useState } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import FeedbackDetailModal from "@/components/admin/inbox/FeedbackDetailModal";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { useInboxList } from "@/components/admin/inbox/useInboxList";
import { authedFetch } from "@/lib/authedFetch";
import { formatAdminReceivedAt } from "@/lib/adminList";
import { FEEDBACK_TYPES } from "@/lib/feedback";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/inboxStatus";

const TYPE_LABELS = new Map<string, string>(
  FEEDBACK_TYPES.map((type) => [type.value, type.label]),
);

export default function FeedbackList({
  showToast,
}: {
  showToast: (message: string, type?: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { filter, setFilter, page, setPage, items, total, state } =
    useInboxList<FeedbackItem>("/api/admin-feedback", {}, refreshKey);
  // 목록 행이 아니라 연 시점의 항목을 든다. 상태를 바꿔 현재 필터에서 빠져도 모달은 열린 채 남는다.
  const [opened, setOpened] = useState<FeedbackItem | null>(null);
  const [pending, setPending] = useState(false);

  async function changeStatus(id: string, status: FeedbackStatus) {
    setPending(true);
    const response = await authedFetch(`/api/admin-feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) showToast("상태를 바꾸지 못했어요", "error");
    else
      setOpened((previous) =>
        previous?.id === id ? { ...previous, status } : previous,
      );
    // 실패해도 다시 읽는다. 선택 상자가 서버 값과 어긋난 채로 남지 않게 한다.
    setRefreshKey((key) => key + 1);
    window.dispatchEvent(new Event("inboxCountsChanged"));
  }

  const typeLabel = (type: string) => TYPE_LABELS.get(type) ?? type;

  return (
    <section aria-label="피드백">
      <div className="ku-admin-list-controls">
        <InboxFilterSelect value={filter} onChange={setFilter} />
      </div>
      {state === "loading" ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : state === "error" ? (
        <div className="ku-admin-empty">목록을 불러오지 못했어요.</div>
      ) : items.length === 0 ? (
        <div className="ku-admin-empty">피드백이 없어요.</div>
      ) : (
        <ul className="ku-inbox-list" aria-label="피드백 목록">
          {items.map((item) => (
            <li key={item.id} className="ku-feedback-row">
              <div className="ku-feedback-head">
                <span className="ku-feedback-type">
                  {typeLabel(item.feedback_type)}
                </span>
                <span className="ku-inbox-row-meta">
                  {formatAdminReceivedAt(item.created_at)}
                </span>
                <select
                  aria-label="처리 상태"
                  value={item.status}
                  disabled={pending}
                  onChange={(event) =>
                    void changeStatus(
                      item.id,
                      event.target.value as FeedbackStatus,
                    )
                  }
                >
                  {(
                    Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]
                  ).map((status) => (
                    <option key={status} value={status}>
                      {FEEDBACK_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="ku-feedback-preview"
                aria-haspopup="dialog"
                onClick={() => setOpened(item)}
              >
                {item.content}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination page={page} totalCount={total} onPageChange={setPage} />
      {opened && (
        <FeedbackDetailModal
          item={opened}
          typeLabel={typeLabel(opened.feedback_type)}
          pending={pending}
          onStatusChange={(status) => void changeStatus(opened.id, status)}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}
