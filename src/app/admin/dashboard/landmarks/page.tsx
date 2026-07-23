"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { deleteLandmark } from "@/lib/landmarkDelete";
import type { Landmark } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import LandmarkFormModal from "@/components/admin/LandmarkFormModal";
import AdminListControls from "@/components/admin/AdminListControls";
import AdminPagination from "@/components/admin/AdminPagination";
import {
  buildAdminSearchFilter,
  formatAdminUpdatedAt,
  getAdminPageCount,
  getAdminPageRange,
  type AdminListSort,
} from "@/lib/adminList";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function LandmarksPage() {
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [editingLandmark, setEditingLandmark] = useState<Landmark | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Landmark | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [photoFilter, setPhotoFilter] = useState("all");
  const [sort, setSort] = useState<AdminListSort>("updated-desc");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const debouncedSearch = useDebouncedValue(searchQuery);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    photoFilter !== "all" ||
    sort !== "updated-desc";

  function resetControls() {
    setSearchQuery("");
    setPhotoFilter("all");
    setSort("updated-desc");
    setPage(1);
  }

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const fetchData = useCallback(async () => {
    const { from, to } = getAdminPageRange(page);
    let query = supabase.from("landmarks").select("*", { count: "exact" });
    const searchFilter = buildAdminSearchFilter(
      ["name", "name_en", "name_zh", "description"],
      debouncedSearch,
    );
    if (searchFilter) query = query.or(searchFilter);
    if (photoFilter === "with-photo") query = query.neq("photo_url", "");
    if (photoFilter === "without-photo") query = query.is("photo_url", null);
    query =
      sort === "name"
        ? query.order("name", { ascending: true })
        : query.order("updated_at", {
            ascending: sort === "updated-asc",
            nullsFirst: false,
          });
    const { data, error, count } = await query
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const nextTotal = count ?? 0;
    const pageCount = getAdminPageCount(nextTotal);
    if (page > pageCount) {
      setPage(pageCount);
      return;
    }
    setLoadError(false);
    setLandmarks(data ?? []);
    setTotalCount(nextTotal);
    setLoading(false);
  }, [debouncedSearch, page, photoFilter, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function handleDelete(landmark: Landmark) {
    const error = await deleteLandmark(landmark);
    setConfirmDelete(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
    authedFetch("/api/revalidate-landmarks", { method: "POST" }).catch(
      () => {},
    );
    showToast("명소가 삭제되었어요");
  }

  if (loading)
    return (
      <div style={{ padding: 40, color: "var(--ku-text-3)" }}>
        불러오는 중...
      </div>
    );
  if (loadError)
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>명소 목록을 불러오지 못했어요.</p>
        <button onClick={fetchData}>다시 시도</button>
      </div>
    );

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          background: "var(--ku-surface)",
          borderRadius: 10,
          padding: 20,
          border: "1px solid var(--ku-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>명소</div>
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              background: "var(--ku-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + 명소 추가
          </button>
        </div>
        <div
          style={{ fontSize: 12, color: "var(--ku-text-2)", marginBottom: 16 }}
        >
          지도에 표시할 캠퍼스 명소를 관리해요.
        </div>

        <AdminListControls
          searchValue={searchQuery}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
          searchLabel="명소 검색"
          searchPlaceholder="명소명 또는 설명 검색"
          resultCount={landmarks.length}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          onReset={resetControls}
        >
          <select
            value={photoFilter}
            onChange={(event) => {
              setPhotoFilter(event.target.value);
              setPage(1);
            }}
            aria-label="명소 사진 필터"
          >
            <option value="all">사진 전체</option>
            <option value="with-photo">사진 있음</option>
            <option value="without-photo">사진 없음</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminListSort);
              setPage(1);
            }}
            aria-label="명소 정렬"
          >
            <option value="updated-desc">최근 수정순</option>
            <option value="updated-asc">오래 수정순</option>
            <option value="name">이름순</option>
          </select>
        </AdminListControls>

        {totalCount === 0 && !hasActiveFilters ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--ku-text-3)",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            등록된 명소가 없어요
          </div>
        ) : totalCount === 0 ? (
          <div className="ku-admin-list-empty">조건에 맞는 명소가 없어요</div>
        ) : (
          landmarks.map((landmark) => (
            <div
              key={landmark.id}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid var(--ku-border)",
              }}
            >
              <div style={{ fontSize: 22, width: 28, textAlign: "center" }}>
                {landmark.icon}
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div
                  data-testid="admin-list-item-name"
                  style={{ fontSize: 14, fontWeight: 500 }}
                >
                  {landmark.name}
                </div>
                {landmark.description && (
                  <div style={{ fontSize: 12, color: "var(--ku-text-2)" }}>
                    {landmark.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--ku-text-3)" }}>
                  위도 {landmark.lat} / 경도 {landmark.lng}
                </div>
                <div style={{ fontSize: 11, color: "var(--ku-text-3)" }}>
                  {formatAdminUpdatedAt(landmark.updated_at)}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: landmark.photo_url
                    ? "var(--ku-status-warn-bg)"
                    : "var(--ku-divider)",
                  color: landmark.photo_url
                    ? "var(--ku-status-warn-fg)"
                    : "var(--ku-text-2)",
                  flexShrink: 0,
                }}
              >
                {landmark.photo_url ? "사진 있음" : "사진 없음"}
              </span>
              <button
                onClick={() => setEditingLandmark(landmark)}
                style={{
                  fontSize: 12,
                  color: "var(--ku-primary-text)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(landmark)}
                style={{
                  fontSize: 12,
                  color: "var(--ku-danger)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                삭제
              </button>
            </div>
          ))
        )}
        <AdminPagination
          page={page}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>

      {creating && (
        <LandmarkFormModal
          center={KU_CENTER}
          landmark={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            fetchData();
            authedFetch("/api/revalidate-landmarks", { method: "POST" }).catch(
              () => {},
            );
          }}
          showToast={showToast}
        />
      )}

      {editingLandmark && (
        <LandmarkFormModal
          center={[editingLandmark.lat, editingLandmark.lng]}
          landmark={editingLandmark}
          onClose={() => setEditingLandmark(null)}
          onSaved={() => {
            setEditingLandmark(null);
            fetchData();
            authedFetch("/api/revalidate-landmarks", { method: "POST" }).catch(
              () => {},
            );
          }}
          onPhotoChanged={fetchData}
          showToast={showToast}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="명소를 삭제할까요?"
          description="삭제한 명소와 연결된 사진은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
