"use client";

import { useCallback, useState, useEffect } from "react";
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
  const [slopes, setSlopes] = useState<SlopeSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const name = selectedFile.name.replace(/\.gpx$/i, "");
      const text = await selectedFile.text();
      const xml = new DOMParser().parseFromString(text, "application/xml");
      if (xml.querySelectorAll("parsererror").length > 0) {
        throw new Error(
          "GPX 파일을 파싱할 수 없습니다. 유효한 GPX 형식인지 확인하세요.",
        );
      }

      const trkpts = Array.from(xml.querySelectorAll("trkpt"));
      const points = trkpts
        .map((pt) => ({
          lat: parseFloat(pt.getAttribute("lat") ?? "NaN"),
          lng: parseFloat(pt.getAttribute("lon") ?? "NaN"),
          ele: parseFloat(pt.querySelector("ele")?.textContent ?? "NaN"),
        }))
        .filter((p) => !isNaN(p.lat) && !isNaN(p.lng) && !isNaN(p.ele));

      if (points.length < 2) {
        throw new Error(
          "유효한 GPS 포인트가 부족합니다 (고도 데이터 포함 최소 2개 필요).",
        );
      }

      // 원본 포인트를 그대로 저장 — 경사도 계산은 렌더링 시 클라이언트에서 수행
      const segments = points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        ele: p.ele,
      }));

      const { error } = await supabase.from("slope_segments").insert({
        name,
        gpx_file: selectedFile.name,
        segments,
      });
      if (error) throw error;

      setSelectedFile(null);
      (document.getElementById("gpx-input") as HTMLInputElement).value = "";
      await fetchSlopes();
      showToast(`"${name}" 경로를 등록했어요`);
    } catch (err) {
      showToast("업로드 실패: " + (err as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

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

      {/* 업로드 섹션 */}
      <div
        style={{
          background: "var(--ku-surface)",
          borderRadius: 10,
          border: "1px solid var(--ku-border)",
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          GPX 파일 업로드
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <input
            id="gpx-input"
            type="file"
            accept=".gpx"
            aria-label="GPX 파일 선택"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            style={{
              padding: "8px 20px",
              background:
                selectedFile && !uploading
                  ? "var(--ku-primary)"
                  : "var(--ku-border)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: selectedFile && !uploading ? "pointer" : "not-allowed",
            }}
          >
            {uploading ? "처리 중..." : "업로드 & 저장"}
          </button>
        </div>
        {selectedFile && (
          <div
            style={{ fontSize: 12, color: "var(--ku-text-2)", marginBottom: 4 }}
          >
            경로명: <strong>{selectedFile.name.replace(/\.gpx$/i, "")}</strong>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--ku-text-3)" }}>
          파일명이 경로명으로 사용됩니다. 업로드 전 파일명을 원하는 경로명으로
          변경하세요 (예: 정문-중앙광장.gpx)
        </div>
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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          등록된 경로 (총 {totalCount}개)
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
                    {s.gpx_file && (
                      <span
                        style={{ marginLeft: 8, color: "var(--ku-text-3)" }}
                      >
                        ({s.gpx_file})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
