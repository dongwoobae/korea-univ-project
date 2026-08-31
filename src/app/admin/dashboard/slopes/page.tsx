"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { SlopePoint, SlopeSegment } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
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
import { isManualRoute } from "@/lib/slopeRoute";

function buildGpx(name: string, points: SlopePoint[]) {
  const trkpts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat}" lon="${p.lng}"><ele>${p.ele}</ele></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KU Barrier-Free Map">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadGpx(route: SlopeSegment) {
  const content = buildGpx(route.name, route.segments);
  const blob = new Blob([content], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = route.gpx_file ?? `${route.name}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SlopesPage() {
  const router = useRouter();
  const [slopes, setSlopes] = useState<SlopeSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<SlopeSegment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<AdminListSort>("updated-desc");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const debouncedSearch = useDebouncedValue(searchQuery);

  const hasActiveFilters = searchQuery.trim() !== "" || sort !== "updated-desc";

  function resetControls() {
    setSearchQuery("");
    setSort("updated-desc");
    setPage(1);
  }

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const fetchSlopes = useCallback(async () => {
    const { from, to } = getAdminPageRange(page);
    let query = supabase.from("slope_segments").select("*", { count: "exact" });
    const searchFilter = buildAdminSearchFilter(
      ["name", "gpx_file"],
      debouncedSearch,
    );
    if (searchFilter) query = query.or(searchFilter);
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
      setLoading(false);
      setToast({
        message: "경사도 경로를 불러오지 못했어요",
        type: "error",
      });
      return;
    }
    const nextTotal = count ?? 0;
    const pageCount = getAdminPageCount(nextTotal);
    if (page > pageCount) {
      setPage(pageCount);
      return;
    }
    setSlopes((data ?? []) as unknown as SlopeSegment[]);
    setTotalCount(nextTotal);
    setLoading(false);
  }, [debouncedSearch, page, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchSlopes(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchSlopes]);

  // 수정 화면이 GPX 행을 열지 않고 여기로 돌려보낼 때 사유를 쿼리로 넘긴다.
  // replace로 지워 새로고침·뒤로가기에 안내가 다시 뜨지 않게 한다.
  useEffect(() => {
    const redirected = new URLSearchParams(window.location.search).get(
      "redirected",
    );
    if (redirected !== "gpx") return;
    setToast({
      message:
        "GPX 경로는 측정 원본이라 수정할 수 없어요. 목록에서 다운로드만 가능해요",
      type: "warning",
    });
    router.replace("/admin/dashboard/slopes");
  }, [router]);

  async function handleDelete(route: SlopeSegment) {
    setDeletingId(route.id);
    const { error } = await supabase
      .from("slope_segments")
      .delete()
      .eq("id", route.id);
    setDeletingId(null);
    setConfirmDelete(null);
    if (error) {
      showToast("삭제 실패: " + error.message, "error");
      return;
    }
    await fetchSlopes();
    showToast(`"${route.name}" 경로를 삭제했어요`);
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 관리
      </div>

      <div
        style={{
          background: "var(--ku-surface)",
          borderRadius: 10,
          border: "1px solid var(--ku-border)",
          padding: 24,
          marginBottom: 24,
          fontSize: 13,
          color: "var(--ku-text-2)",
        }}
      >
        GPX 등록은 종료됐어요. 경로는 직접 그려서 등록해주세요
      </div>

      {/* 경로 목록 */}
      <div
        style={{
          background: "var(--ku-surface)",
          borderRadius: 10,
          border: "1px solid var(--ku-border)",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            등록된 경로 (총 {totalCount}개)
          </div>
          <button
            onClick={() => router.push("/admin/slopes/new")}
            style={{
              padding: "8px 16px",
              background: "var(--ku-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            경로 직접 그리기
          </button>
        </div>
        <AdminListControls
          searchValue={searchQuery}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
          searchLabel="경사도 경로 검색"
          searchPlaceholder="경로명 또는 GPX 파일명 검색"
          resultCount={slopes.length}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          onReset={resetControls}
        >
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminListSort);
              setPage(1);
            }}
            aria-label="경사도 경로 정렬"
          >
            <option value="updated-desc">최근 수정순</option>
            <option value="updated-asc">오래 수정순</option>
            <option value="name">이름순</option>
          </select>
        </AdminListControls>
        {loading ? (
          <div style={{ color: "var(--ku-text-3)", fontSize: 13 }}>
            불러오는 중...
          </div>
        ) : totalCount === 0 && !hasActiveFilters ? (
          <div style={{ color: "var(--ku-text-3)", fontSize: 13 }}>
            등록된 경로가 없습니다.
          </div>
        ) : totalCount === 0 ? (
          <div className="ku-admin-list-empty">
            조건에 맞는 경사도 경로가 없어요
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {slopes.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div
                    data-testid="admin-list-item-name"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--ku-text-1)",
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ku-text-2)",
                      marginTop: 2,
                    }}
                  >
                    {s.segments?.length ?? 0}개 포인트 ·{" "}
                    {formatAdminUpdatedAt(s.updated_at)}
                    {isManualRoute(s) ? (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "var(--ku-border)",
                          color: "var(--ku-text-2)",
                          fontSize: 11,
                        }}
                      >
                        직접 입력
                      </span>
                    ) : (
                      <span
                        style={{ marginLeft: 8, color: "var(--ku-text-3)" }}
                      >
                        ({s.gpx_file})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {isManualRoute(s) ? (
                    <button
                      onClick={() => router.push(`/admin/slopes/${s.id}`)}
                      className="ku-admin-row-action"
                      style={{
                        fontSize: 13,
                        color: "var(--ku-primary-text)",
                        background: "none",
                        border: "1px solid var(--ku-primary-text)",
                        borderRadius: 6,
                        padding: "6px 12px",
                        cursor: "pointer",
                      }}
                    >
                      수정
                    </button>
                  ) : (
                    <button
                      onClick={() => downloadGpx(s)}
                      className="ku-admin-row-action"
                      style={{
                        fontSize: 13,
                        color: "var(--ku-primary-text)",
                        background: "none",
                        border: "1px solid var(--ku-primary-text)",
                        borderRadius: 6,
                        padding: "6px 12px",
                        cursor: "pointer",
                      }}
                    >
                      다운로드
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(s)}
                    disabled={deletingId === s.id}
                    className="ku-admin-row-action ku-admin-row-action--danger"
                    style={{
                      fontSize: 13,
                      color: "var(--ku-danger)",
                      background: "none",
                      border: "1px solid var(--ku-danger)",
                      borderRadius: 6,
                      padding: "6px 12px",
                      cursor: deletingId === s.id ? "wait" : "pointer",
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <AdminPagination
          page={page}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`"${confirmDelete.name}" 경로를 삭제할까요?`}
          description="삭제한 경사도 경로는 복구할 수 없어요."
          confirmLabel="경로 삭제"
          pending={deletingId === confirmDelete.id}
          pendingLabel="삭제 중..."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
