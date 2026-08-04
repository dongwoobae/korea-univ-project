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
import {
  ADMIN_BUILDING_FLAG_LABELS,
  ADMIN_SUMMARY_ITEMS,
  resolveFlagFilter,
  resolveSummary,
  type AdminBuildingFlagKey,
  type AdminBuildingSummary,
} from "@/lib/adminBuildingSummary";

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
  const [summaryError, setSummaryError] = useState(false);
  const [activeFlag, setActiveFlag] = useState<AdminBuildingFlagKey | null>(
    null,
  );
  const [listError, setListError] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const router = useRouter();

  useEffect(() => {
    void fetch("/campus-boundaries.geojson")
      .then((response) => response.json() as Promise<CampusBoundaryCollection>)
      .then(setCampusBoundaries);
  }, []);

  const fetchSummary = useCallback(async () => {
    const [totalResult, deletedResult, summaryResult] = await Promise.all([
      supabase.from("buildings").select("id", { count: "exact", head: true }),
      supabase
        .from("buildings")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", true),
      supabase.rpc("get_admin_building_summary").single(),
    ]);
    const resolved = resolveSummary(totalResult, deletedResult, summaryResult);
    if (resolved.status === "error") {
      // 원문은 콘솔로만 보낸다. PostgREST 오류의 message·details·hint에는
      // 함수 시그니처, relation·column 이름, schema cache 힌트가 담긴다.
      console.error("건물 요약 조회 실패", resolved.errors);
      setSummary(null);
      setSummaryError(true);
      return;
    }
    setSummaryError(false);
    setOverallTotalCount(resolved.value.overallTotalCount);
    setDeletedCount(resolved.value.deletedCount);
    setSummary(resolved.value.summary);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchSummary]);

  const fetchData = useCallback(async () => {
    setListError(false);

    let flagIds: number[] | null = null;
    if (activeFlag) {
      const flagResponse = await supabase
        .from("admin_building_flags")
        .select("building_id")
        .eq(activeFlag, true);
      const resolved = resolveFlagFilter(flagResponse);
      if (resolved.status === "error") {
        console.error("건물 플래그 조회 실패", flagResponse.error);
        setBuildings([]);
        setFacilityCounts(new Map());
        setTotalCount(0);
        setListError(true);
        setLoading(false);
        return;
      }
      if (resolved.status === "empty") {
        // 빈 배열을 .in()에 넘기면 id=in.()으로 직렬화돼 PostgREST가 파싱 오류를 낸다.
        setBuildings([]);
        setFacilityCounts(new Map());
        setTotalCount(0);
        setLoading(false);
        return;
      }
      flagIds = resolved.ids;
    }

    const { from, to } = getAdminPageRange(page);
    let query = supabase.from("buildings").select("*", { count: "exact" });
    if (flagIds) query = query.in("id", flagIds);
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
      console.error("건물 목록 조회 실패", error);
      setBuildings([]);
      setFacilityCounts(new Map());
      setTotalCount(0);
      setListError(true);
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
  }, [activeFlag, debouncedSearch, page]);

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

  // 필터는 한 번에 하나만. 같은 카드를 다시 누르면 꺼진다.
  // 페이지를 1로 되돌리지 않으면 결과가 1페이지뿐인데 3페이지에 머무는 일이 생긴다.
  function toggleFlag(flag: AdminBuildingFlagKey) {
    setActiveFlag((current) => (current === flag ? null : flag));
    setPage(1);
  }

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
            {summaryError
              ? "건물 수를 불러오지 못했어요"
              : `총 ${overallTotalCount}개 · 삭제됨 ${deletedCount}개`}
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

      {summaryError ? (
        <div className="ku-admin-overview-error" role="status">
          <span>요약을 불러오지 못했어요.</span>
          <button
            className="ku-admin-button"
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div
          className="ku-admin-overview"
          role="group"
          aria-label="관리자 보완 현황"
        >
          {ADMIN_SUMMARY_ITEMS.map((item) => {
            const body = (
              <>
                <span className="ku-admin-overview-label">{item.label}</span>
                <span className="ku-admin-overview-value">
                  {summary ? (
                    item.parts(summary).map((part, index) => (
                      <span
                        className="ku-admin-overview-part"
                        key={part.prefix ?? index}
                      >
                        {part.prefix && <span>{part.prefix}</span>}
                        <strong>{part.value}</strong>
                        <span>개</span>
                      </span>
                    ))
                  ) : (
                    <strong>—</strong>
                  )}
                </span>
              </>
            );
            const warning = Boolean(
              item.flag && summary && item.warningValue(summary) > 0,
            );
            // 클릭 대상이 아닌 총계 카드는 button으로 만들지 않는다.
            // 눌리지 않는 버튼은 키보드 사용자가 포커스를 받고도 아무 일이 없다.
            return item.flag ? (
              <button
                className="ku-admin-overview-item"
                type="button"
                data-warning={warning}
                aria-pressed={activeFlag === item.flag}
                key={item.id}
                title={item.description}
                onClick={() => toggleFlag(item.flag!)}
              >
                {body}
              </button>
            ) : (
              <div
                className="ku-admin-overview-item"
                data-warning={warning}
                key={item.id}
                title={item.description}
              >
                {body}
              </div>
            );
          })}
        </div>
      )}

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
        hasActiveFilters={search.trim() !== "" || activeFlag !== null}
        onReset={() => {
          setSearch("");
          setActiveFlag(null);
          setPage(1);
        }}
      />

      {loading ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : listError ? (
        <div className="ku-admin-empty">
          목록을 불러오지 못했어요.{" "}
          <button
            className="ku-admin-button"
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            다시 시도
          </button>
        </div>
      ) : buildings.length === 0 ? (
        <div className="ku-admin-empty">
          {activeFlag
            ? `‘${ADMIN_BUILDING_FLAG_LABELS[activeFlag]}’에 해당하는 건물이 없습니다.`
            : "검색 결과가 없습니다."}
        </div>
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
