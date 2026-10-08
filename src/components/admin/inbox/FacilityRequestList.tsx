"use client";

import AdminPagination from "@/components/admin/AdminPagination";
import InboxFilterSelect from "@/components/admin/inbox/InboxFilterSelect";
import { useInboxList } from "@/components/admin/inbox/useInboxList";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  REQUEST_STATUS_LABELS,
  type FacilityRequestListItem,
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
  const { filter, setFilter, page, setPage, items, total, state } =
    useInboxList<FacilityRequestListItem>(
      "/api/facility-requests",
      building ? { building: String(building) } : {},
      refreshKey,
    );

  return (
    <section aria-label="등록 요청">
      <div className="ku-admin-list-controls">
        <InboxFilterSelect value={filter} onChange={setFilter} />
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
