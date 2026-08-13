"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { deleteFacility } from "@/lib/facilityDelete";
import type { FacilityWithType, FacilityType } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import AddFacilityButton from "@/components/admin/AddFacilityButton";
import FacilityFormModal from "@/components/admin/FacilityFormModal";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import FacilityInstallationControl from "@/components/admin/FacilityInstallationControl";
import FacilityTranslationControl from "@/components/admin/FacilityTranslationControl";
import AdminListControls from "@/components/admin/AdminListControls";
import AdminPagination from "@/components/admin/AdminPagination";
import { FacilityTypeIcon } from "@/components/map/iconography";
import {
  buildAdminSearchFilter,
  formatAdminUpdatedAt,
  getAdminPageCount,
  getAdminPageRange,
  type AdminListSort,
} from "@/lib/adminList";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [installationFilter, setInstallationFilter] = useState("all");
  const [sort, setSort] = useState<AdminListSort>("updated-desc");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<FacilityWithType | null>(
    null,
  );
  const [editingFacility, setEditingFacility] =
    useState<FacilityWithType | null>(null);
  const [videoModalFacility, setVideoModalFacility] =
    useState<FacilityWithType | null>(null);
  const debouncedSearch = useDebouncedValue(searchQuery);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    typeFilter !== "all" ||
    installationFilter !== "all" ||
    sort !== "updated-desc";

  function resetControls() {
    setSearchQuery("");
    setTypeFilter("all");
    setInstallationFilter("all");
    setSort("updated-desc");
    setPage(1);
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    void supabase
      .from("facility_types")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        setFacilityTypes(data ?? []);
      });
  }, []);

  const fetchData = useCallback(async () => {
    const { from, to } = getAdminPageRange(page);
    let query = supabase
      .from("building_facilities")
      .select("*, facility_types(code, label)", { count: "exact" })
      .is("building_id", null);
    const searchFilter = buildAdminSearchFilter(
      ["name", "name_en", "name_zh", "description"],
      debouncedSearch,
    );
    if (searchFilter) query = query.or(searchFilter);
    if (typeFilter !== "all") query = query.eq("facility_code", typeFilter);
    if (installationFilter !== "all") {
      query = query.eq("is_installed", installationFilter === "installed");
    }
    query =
      sort === "name"
        ? query.order("name", { ascending: true, nullsFirst: false })
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
    setFacilities(data ?? []);
    setTotalCount(nextTotal);
    setLoading(false);
  }, [debouncedSearch, installationFilter, page, sort, typeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function handleDelete(facility) {
    const error = await deleteFacility(facility);
    setConfirmDelete(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
    showToast("시설이 삭제되었어요");
  }

  async function handleToggleInstalled(facility) {
    setTogglingId(facility.id);
    const { error } = await supabase
      .from("building_facilities")
      .update({ is_installed: !facility.is_installed })
      .eq("id", facility.id);
    setTogglingId(null);
    if (error) {
      showToast("설치 상태 변경에 실패했어요", "error");
      return;
    }
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    await fetchData();
    showToast(
      facility.is_installed ? "미설치로 변경되었어요" : "설치로 변경되었어요",
    );
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
        <p>시설 목록을 불러오지 못했어요.</p>
        <button onClick={fetchData}>다시 시도</button>
      </div>
    );

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
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
          <div style={{ fontSize: 15, fontWeight: 600 }}>독립 시설</div>
          <AddFacilityButton
            buildingId={null}
            center={KU_CENTER}
            facilityTypes={facilityTypes}
            onAdd={fetchData}
            showToast={showToast}
          />
        </div>
        <div
          style={{ fontSize: 12, color: "var(--ku-text-2)", marginBottom: 16 }}
        >
          건물에 소속되지 않는 시설(야외 경사로, 독립 주차구역 등)을 관리해요.
        </div>

        <AdminListControls
          searchValue={searchQuery}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
          searchLabel="독립 시설 검색"
          searchPlaceholder="시설명 또는 설명 검색"
          resultCount={facilities.length}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          onReset={resetControls}
        >
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
            aria-label="시설 유형 필터"
          >
            <option value="all">모든 유형</option>
            {facilityTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            value={installationFilter}
            onChange={(event) => {
              setInstallationFilter(event.target.value);
              setPage(1);
            }}
            aria-label="설치 상태 필터"
          >
            <option value="all">모든 상태</option>
            <option value="installed">설치</option>
            <option value="missing">미설치</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminListSort);
              setPage(1);
            }}
            aria-label="독립 시설 정렬"
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
            등록된 독립 시설이 없어요
          </div>
        ) : totalCount === 0 ? (
          <div className="ku-admin-list-empty">
            조건에 맞는 독립 시설이 없어요
          </div>
        ) : (
          facilities.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid var(--ku-border)",
              }}
            >
              <FacilityTypeIcon code={f.facility_types?.code} size={20} />
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div
                  data-testid="admin-list-item-name"
                  style={{ fontSize: 14, fontWeight: 500 }}
                >
                  {f.name ?? f.facility_types?.label}
                </div>
                {f.description && (
                  <div style={{ fontSize: 12, color: "var(--ku-text-2)" }}>
                    {f.description}
                  </div>
                )}
                {f.lat && (
                  <div style={{ fontSize: 11, color: "var(--ku-text-3)" }}>
                    위도 {f.lat} / 경도 {f.lng}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--ku-text-3)" }}>
                  {formatAdminUpdatedAt(f.updated_at)}
                </div>
              </div>
              <button
                onClick={() => setVideoModalFacility(f)}
                className="ku-admin-row-action"
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid",
                  cursor: "pointer",
                  fontWeight: 500,
                  background: f.video_url
                    ? "var(--ku-primary-soft-bg)"
                    : "none",
                  borderColor: f.video_url
                    ? "var(--ku-primary-text)"
                    : "var(--ku-border)",
                  color: f.video_url
                    ? "var(--ku-primary-text)"
                    : "var(--ku-text-2)",
                }}
              >
                {f.video_url ? "동영상 ✓" : "동영상"}
              </button>
              <FacilityInstallationControl
                installed={f.is_installed}
                pending={togglingId === f.id}
                onToggle={() => handleToggleInstalled(f)}
              />
              <FacilityTranslationControl
                facility={f}
                onTranslated={fetchData}
                showToast={showToast}
              />
              <button
                onClick={() => setEditingFacility(f)}
                className="ku-admin-row-action"
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
                onClick={() => setConfirmDelete(f)}
                className="ku-admin-row-action ku-admin-row-action--danger"
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

      {editingFacility && (
        <FacilityFormModal
          buildingId={null}
          center={
            editingFacility.lat != null && editingFacility.lng != null
              ? [editingFacility.lat, editingFacility.lng]
              : KU_CENTER
          }
          facilityTypes={facilityTypes}
          facility={editingFacility}
          onClose={() => setEditingFacility(null)}
          onSaved={() => {
            setEditingFacility(null);
            fetchData();
          }}
          showToast={showToast}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="시설을 삭제할까요?"
          description="삭제한 시설은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {videoModalFacility && (
        <FacilityVideoModal
          facility={videoModalFacility}
          onUpdate={() => {
            fetchData();
            setVideoModalFacility((f) => (f ? { ...f } : null));
          }}
          showToast={showToast}
          onClose={() => setVideoModalFacility(null)}
        />
      )}
    </div>
  );
}
