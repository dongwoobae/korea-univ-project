"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { campusColor } from "@/lib/theme";
import { inferCampusFromGeometry, type CampusBoundaryCollection } from "@/lib/campusGeometry";
import type { Feature } from "geojson";
import type { Building, Facility } from "@/types/domain";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [facilities, setFacilities] = useState<Pick<Facility, "building_id">[]>([]);
  const [campusBoundaries, setCampusBoundaries] = useState<CampusBoundaryCollection | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      const [{ data: buildingData }, { data: facilityData }, boundaries] = await Promise.all([
        supabase.from("buildings").select("*").order("name"),
        supabase
          .from("building_facilities")
          .select("building_id")
          .not("building_id", "is", null),
        fetch("/campus-boundaries.geojson").then((response) => response.json() as Promise<CampusBoundaryCollection>),
      ]);
      setBuildings(buildingData ?? []);
      setFacilities(facilityData ?? []);
      setCampusBoundaries(boundaries);
      setLoading(false);
    }
    fetchData();
  }, []);

  const facilityCounts = useMemo(() => {
    const counts = new Map<number, number>();
    facilities.forEach((facility) => {
      if (facility.building_id !== null)
        counts.set(facility.building_id, (counts.get(facility.building_id) ?? 0) + 1);
    });
    return counts;
  }, [facilities]);

  const campusByBuilding = useMemo(() => new Map(
    buildings.map((building) => [
      building.id,
      inferCampusFromGeometry(building.geojson as unknown as Feature, campusBoundaries) ?? "",
    ]),
  ), [buildings, campusBoundaries]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return buildings
      .filter((building) =>
        !normalized ||
        building.name?.toLocaleLowerCase().includes(normalized) ||
        building.name_en?.toLocaleLowerCase().includes(normalized),
      )
      .sort((a, b) => Number(a.is_deleted) - Number(b.is_deleted));
  }, [buildings, search]);

  const deletedCount = buildings.filter((building) => building.is_deleted).length;
  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <div>
          <h1 className="ku-admin-title">건물 관리</h1>
          <p className="ku-admin-caption">총 {buildings.length}개 · 삭제됨 {deletedCount}개</p>
        </div>
        <div className="ku-admin-actions">
          <button className="ku-admin-button" type="button" onClick={() => window.location.reload()}>↻ 새로고침</button>
          <button className="ku-admin-button ku-admin-button--accent" type="button" onClick={() => router.push("/admin/buildings/new")}>＋ 건물 추가</button>
        </div>
      </div>

      <div className="ku-admin-summary-strip" aria-label="시설 등록 현황">
        등록된 시설 <strong>{facilities.length}</strong>개
      </div>

      <div className="ku-admin-search">
        <span aria-hidden="true">🔍</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="건물명 검색..." aria-label="건물명 검색" />
      </div>

      {loading ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="ku-admin-empty">검색 결과가 없습니다.</div>
      ) : (
        <>
          <div className="ku-admin-table" role="table" aria-label="건물 목록">
            <div className="ku-admin-table-row ku-admin-table-row--head" role="row">
              <span>건물</span><span>캠퍼스</span><span>시설</span><span>최근 업데이트</span><span>상태</span><span>액션</span>
            </div>
            {filtered.map((building) => {
              const campus = campusByBuilding.get(building.id) ?? "";
              return (
                <div className="ku-admin-table-row" role="row" key={building.id} data-deleted={building.is_deleted}>
                  <div><div className="ku-admin-building-name">{building.name}</div><div className="ku-admin-building-en">{building.name_en || "—"}</div></div>
                  <div className="ku-admin-campus"><span className="ku-admin-campus-dot" style={{ "--campus-color": campusColor[campus] ?? "#8A837D" } as CSSProperties} />{campus}</div>
                  <div className="ku-admin-cell">{facilityCounts.get(building.id) ?? 0}개</div>
                  <div className="ku-admin-cell">{building.last_updated || "—"}</div>
                  <div><span className="ku-admin-status" data-deleted={building.is_deleted}>{building.is_deleted ? "삭제됨" : "공개"}</span></div>
                  <div className="ku-admin-row-actions">
                    <button className="ku-admin-button" type="button" onClick={() => router.push(`/admin/buildings/${building.id}`)}>{building.is_deleted ? "복구" : "편집"}</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ku-admin-mobile-list">
            {filtered.map((building) => {
              const campus = campusByBuilding.get(building.id) ?? "";
              return (
                <button className="ku-admin-mobile-card" type="button" key={building.id} onClick={() => router.push(`/admin/buildings/${building.id}`)}>
                  <div className="ku-admin-mobile-copy">
                    <div className="ku-admin-building-name">{building.name}</div>
                    <div className="ku-admin-mobile-meta">
                      <span className="ku-admin-campus-dot" style={{ "--campus-color": campusColor[campus] ?? "#8A837D" } as CSSProperties} />
                      <span>{campus} · 시설 {facilityCounts.get(building.id) ?? 0}개 · {building.last_updated || "날짜 없음"}</span>
                      <span className="ku-admin-status" data-deleted={building.is_deleted}>{building.is_deleted ? "삭제됨" : "공개"}</span>
                    </div>
                  </div>
                  <span className="ku-admin-mobile-chevron" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
