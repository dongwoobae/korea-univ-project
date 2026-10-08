"use client";

import { useState } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { useInboxList } from "@/components/admin/inbox/useInboxList";
import { authedFetch } from "@/lib/authedFetch";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { FEEDBACK_TYPES } from "@/lib/feedback";
import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/inboxStatus";

const TYPE_LABELS = new Map<string, string>(
  FEEDBACK_TYPES.map((type) => [type.value, type.label]),
);

// 공개 제출값이다. 제출 API가 http(s)만 받지만 관리자 화면의 링크는 여기서도 거른다.
function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function FeedbackList({
  showToast,
}: {
  showToast: (message: string, type?: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { filter, setFilter, page, setPage, items, total, state } =
    useInboxList<FeedbackItem>("/api/admin-feedback", {}, refreshKey);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function changeStatus(id: string, status: FeedbackStatus) {
    const response = await authedFetch(`/api/admin-feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!response?.ok) showToast("상태를 바꾸지 못했어요", "error");
    // 실패해도 다시 읽는다. 선택 상자가 서버 값과 어긋난 채로 남지 않게 한다.
    setRefreshKey((key) => key + 1);
    window.dispatchEvent(new Event("inboxCountsChanged"));
  }

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
          {items.map((item) => {
            const open = expanded.has(item.id);
            return (
              <li key={item.id} className="ku-feedback-row">
                <div className="ku-feedback-head">
                  <span className="ku-feedback-type">
                    {TYPE_LABELS.get(item.feedback_type) ?? item.feedback_type}
                  </span>
                  <span className="ku-inbox-row-meta">
                    {formatAdminUpdatedAt(item.created_at)}
                  </span>
                  <select
                    aria-label="처리 상태"
                    value={item.status}
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
                <p className="ku-feedback-content" data-expanded={open}>
                  {item.content}
                </p>
                <div className="ku-feedback-foot">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((previous) => {
                        const next = new Set(previous);
                        if (open) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {open ? "접기" : "펼치기"}
                  </button>
                  {item.page_url && isWebUrl(item.page_url) && (
                    <a href={item.page_url} target="_blank" rel="noreferrer">
                      제보한 페이지
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination page={page} totalCount={total} onPageChange={setPage} />
    </section>
  );
}
