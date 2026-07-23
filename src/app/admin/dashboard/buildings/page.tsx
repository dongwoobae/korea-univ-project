"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { campusColor } from "@/lib/theme";
import {
  inferCampusFromGeometry,
  type CampusBoundaryCollection,
} from "@/lib/campusGeometry";
import type { Feature } from "geojson";
import type { Building } from "@/types/domain";
import AdminListControls from "@/components/admin/AdminListControls";
import AdminPagination from "@/components/admin/AdminPagination";
import {
  buildAdminSearchFilter,
  getAdminPageCount,
  getAdminPageRange,
} from "@/lib/adminList";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface AdminBuildingSummary {
  registered_facility_count: number;
  missing_facility_count: number;
  missing_photo_count: number;
  missing_location_count: number;
  stale_update_count: number;
  translation_needed_count: number;
}

const summaryItems: {
  key: keyof AdminBuildingSummary;
  label: string;
  description: string;
  warning?: boolean;
}[] = [
  {
    key: "registered_facility_count",
    label: "등록된 시설",
    description: "공개 건물에 등록된 시설",
  },
  {
    key: "missing_facility_count",
    label: "시설 정보 없음",
    description: "등록된 시설이 없는 공개 건물",
    warning: true,
  },
  {
    key: "missing_photo_count",
    label: "사진 없음",
    description: "사진이 없는 공개 건물",
    warning: true,
  },
  {
    key: "missing_location_count",
    label: "위치 없음",
    description: "지도 위치가 없는 공개 건물",
    warning: true,
  },
  {
    key: "stale_update_count",
    label: "갱신일 오래됨",
    description: "갱신일이 없거나 1년 이상 지난 공개 건물",
    warning: true,
  },
  {
    key: "translation_needed_count",
    label: "번역 필요",
    description: "번역 대기 또는 실패 상태인 시설",
    warning: true,
  },
];

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [facilityCounts, setFacilityCounts] = useState(
    new Map<number, number>(),
  );
  const [totalCount, setTotalCount] = useState(0);
  const [overallTotalCount, setOverallTotalCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [summary, setSummary] = useState<AdminBuildingSummary | null>(null);
  const [campusBoundaries, setCampusBoundaries] =
    useState<CampusBoundaryCollection | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const router = useRouter();

  useEffect(() => {
    void fetch("/campus-boundaries.geojson")
      .then((response) => response.json() as Promise<CampusBoundaryCollection>)
      .then(setCampusBoundaries);
  }, []);

  const fetchSummary = useCallback(async () => {
    const [buildingResult, deletedResult, summaryResult] = await Promise.all([
      supabase.from("buildings").select("id", { count: "exact", head: true }),
      supabase
        .from("buildings")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", true),
      supabase.rpc("get_admin_building_summary").single(),
    ]);
    setOverallTotalCount(buildingResult.count ?? 0);
    setDeletedCount(deletedResult.count ?? 0);
    setSummary(summaryResult.data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchSummary]);

  const fetchData = useCallback(async () => {
    const { from, to } = getAdminPageRange(page);
    let query = supabase.from("buildings").select("*", { count: "exact" });
    const searchFilter = buildAdminSearchFilter(
      ["name", "name_en"],
      debouncedSearch,
    );
    if (searchFilter) query = query.or(searchFilter);
    const { data, error, count } = await query
      .order("is_deleted", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      setBuildings([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const nextTotal = count ?? 0;
    const pageCount = getAdminPageCount(nextTotal);
    if (page > pageCount) {
      setPage(pageCount);
      return;
    }
    const nextBuildings = data ?? [];
    const buildingIds = nextBuildings.map((building) => building.id);
    const { data: facilityData } =
      buildingIds.length === 0
        ? { data: [] }
        : await supabase
            .from("building_facilities")
            .select("building_id")
            .in("building_id", buildingIds);
    const counts = new Map<number, number>();
    (facilityData ?? []).forEach((facility) => {
      if (facility.building_id !== null)
        counts.set(
          facility.building_id,
          (counts.get(facility.building_id) ?? 0) + 1,
        );
    });
    setBuildings(nextBuildings);
    setFacilityCounts(counts);
    setTotalCount(nextTotal);
    setLoading(false);
  }, [debouncedSearch, page]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchSummary(), fetchData()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchData, fetchSummary]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const campusByBuilding = useMemo(
    () =>
      new Map(
        buildings.map((building) => [
          building.id,
          inferCampusFromGeometry(
            building.geojson as unknown as Feature,
            campusBoundaries,
          ) ?? "",
        ]),
      ),
    [buildings, campusBoundaries],
  );

  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <div>
          <h1 className="ku-admin-title">건물 관리</h1>
          <p className="ku-admin-caption">
            총 {overallTotalCount}개 · 삭제됨 {deletedCount}개
          </p>
        </div>
        <div className="ku-admin-actions">
          <button
            className="ku-admin-button"
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            {refreshing ? "갱신 중..." : "↻ 새로고침"}
          </button>
          <button
            className="ku-admin-button ku-admin-button--accent"
            type="button"
            onClick={() => router.push("/admin/buildings/new")}
          >
            ＋ 건물 추가
          </button>
        </div>
      </div>

      <dl
        className="ku-admin-overview"
        role="group"
        aria-label="관리자 보완 현황"
      >
        {summaryItems.map(({ key, label, description, warning }) => {
          const value = summary?.[key];
          return (
            <div
              className="ku-admin-overview-item"
              data-warning={Boolean(warning && value)}
              key={key}
              title={description}
            >
              <dt>{label}</dt>
              <dd>
                <strong>{value ?? "—"}</strong>
                {value !== undefined && <span>개</span>}
              </dd>
            </div>
          );
        })}
      </dl>

      <AdminListControls
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="건물명 검색..."
        searchLabel="건물명 검색"
        resultCount={buildings.length}
        totalCount={totalCount}
        hasActiveFilters={search.trim() !== ""}
        onReset={() => {
          setSearch("");
          setPage(1);
        }}
      />

      {loading ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : buildings.length === 0 ? (
        <div className="ku-admin-empty">검색 결과가 없습니다.</div>
      ) : (
        <>
          <div className="ku-admin-table" role="table" aria-label="건물 목록">
            <div
              className="ku-admin-table-row ku-admin-table-row--head"
              role="row"
            >
              <span>건물</span>
              <span>캠퍼스</span>
              <span>시설</span>
              <span>최근 업데이트</span>
              <span>상태</span>
              <span>액션</span>
            </div>
            {buildings.map((building) => {
              const campus = campusByBuilding.get(building.id) ?? "";
              return (
                <div
                  className="ku-admin-table-row"
                  role="row"
                  key={building.id}
                  data-deleted={building.is_deleted}
                >
                  <div>
                    <div className="ku-admin-building-name">
                      {building.name}
                    </div>
                    <div className="ku-admin-building-en">
                      {building.name_en || "—"}
                    </div>
                  </div>
                  <div className="ku-admin-campus">
                    <span
                      className="ku-admin-campus-dot"
                      style={
                        {
                          "--campus-color": campusColor[campus] ?? "#8A837D",
                        } as CSSProperties
                      }
                    />
                    {campus}
                  </div>
                  <div className="ku-admin-cell">
                    {facilityCounts.get(building.id) ?? 0}개
                  </div>
                  <div className="ku-admin-cell">
                    {building.last_updated || "—"}
                  </div>
                  <div>
                    <span
                      className="ku-admin-status"
                      data-deleted={building.is_deleted}
                    >
                      {building.is_deleted ? "삭제됨" : "공개"}
                    </span>
                  </div>
                  <div className="ku-admin-row-actions">
                    <button
                      className="ku-admin-button"
                      type="button"
                      onClick={() =>
                        router.push(`/admin/buildings/${building.id}`)
                      }
                    >
                      {building.is_deleted ? "복구" : "편집"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ku-admin-mobile-list">
            {buildings.map((building) => {
              const campus = campusByBuilding.get(building.id) ?? "";
              return (
                <button
                  className="ku-admin-mobile-card"
                  type="button"
                  key={building.id}
                  onClick={() => router.push(`/admin/buildings/${building.id}`)}
                >
                  <div className="ku-admin-mobile-copy">
                    <div className="ku-admin-building-name">
                      {building.name}
                    </div>
                    <div className="ku-admin-mobile-meta">
                      <span
                        className="ku-admin-campus-dot"
                        style={
                          {
                            "--campus-color": campusColor[campus] ?? "#8A837D",
                          } as CSSProperties
                        }
                      />
                      <span>
                        {campus} · 시설 {facilityCounts.get(building.id) ?? 0}개
                        · {building.last_updated || "날짜 없음"}
                      </span>
                      <span
                        className="ku-admin-status"
                        data-deleted={building.is_deleted}
                      >
                        {building.is_deleted ? "삭제됨" : "공개"}
                      </span>
                    </div>
                  </div>
                  <span className="ku-admin-mobile-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              );
            })}
          </div>
          <AdminPagination
            page={page}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
