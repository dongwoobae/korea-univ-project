"use client";

import { useEffect, useState } from "react";
import AdminPagination from "@/components/admin/AdminPagination";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { authedFetch } from "@/lib/authedFetch";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  REQUEST_STATUS_LABELS,
  type FacilityRequestListItem,
  type InboxFilter,
} from "@/lib/inboxStatus";

interface FacilityRequestListProps {
  building: number | null;
  onClearBuilding: () => void;
  typeLabels: Map<string, string>;
  onOpen: (id: string) => void;
  refreshKey: number;
}

export default function FacilityRequestList({
  building,
  onClearBuilding,
  typeLabels,
  onOpen,
  refreshKey,
}: FacilityRequestListProps) {
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FacilityRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status: filter, page: String(page) });
    if (building) params.set("building", String(building));
    const timer = window.setTimeout(async () => {
      const response = await authedFetch(
        `/api/facility-requests?${params}`,
      ).catch(() => null);
      if (cancelled) return;
      if (!response?.ok) {
        setState("error");
        return;
      }
      const body = (await response.json()) as {
        items: FacilityRequestListItem[];
        total: number;
      };
      if (cancelled) return;
      setItems(body.items);
      setTotal(body.total);
      setState("ready");
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filter, page, building, refreshKey]);

  return (
    <section aria-label="등록 요청">
      <div className="ku-admin-list-controls">
        <InboxFilterSelect
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
        />
        {building && (
          <button
            type="button"
            className="ku-admin-list-reset"
            aria-label="건물 필터 해제"
            onClick={onClearBuilding}
          >
            건물로 거름 ✕
          </button>
        )}
      </div>
      {state === "loading" ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : state === "error" ? (
        <div className="ku-admin-empty">목록을 불러오지 못했어요.</div>
      ) : items.length === 0 ? (
        <div className="ku-admin-empty">요청이 없어요.</div>
      ) : (
        <ul className="ku-inbox-list" aria-label="등록 요청 목록">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="ku-inbox-row"
                onClick={() => onOpen(item.id)}
              >
                {item.thumbnail_url ? (
                  <img
                    className="ku-inbox-thumb"
                    src={item.thumbnail_url}
                    alt=""
                  />
                ) : (
                  <span
                    className="ku-inbox-thumb ku-inbox-thumb--empty"
                    aria-hidden="true"
                  />
                )}
                <span className="ku-inbox-row-main">
                  <strong>
                    {typeLabels.get(item.facility_code) ?? item.facility_code}
                  </strong>
                  {" · "}
                  {item.building_name ?? `건물 ${item.building_id}`}
                  {item.floor_info ? ` ${item.floor_info}` : ""}
                  <span className="ku-inbox-row-meta">
                    사진 {item.photo_count} ·{" "}
                    {item.has_location ? "위치 있음" : "위치 없음"} ·{" "}
                    {formatAdminUpdatedAt(item.created_at)}
                  </span>
                </span>
                <span className="ku-inbox-status" data-status={item.status}>
                  {REQUEST_STATUS_LABELS[item.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination page={page} totalCount={total} onPageChange={setPage} />
    </section>
  );
}
