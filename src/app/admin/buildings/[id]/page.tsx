"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteFacility } from "@/lib/facilityDelete";
import { invalidateNeighborBuildings } from "@/lib/neighborBuildings";
import type {
  Building,
  FacilityWithType,
  FacilityType,
  College,
} from "@/types/domain";
import { useRouter, useParams } from "next/navigation";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import BuildingPhotoManager from "@/components/admin/BuildingPhotoManager";
import BuildingVideoManager from "@/components/admin/BuildingVideoManager";
import FacilityDetailModal from "@/components/admin/FacilityDetailModal";
import BuildingDetailHeader from "@/components/admin/building-detail/BuildingDetailHeader";
import BuildingNameCard from "@/components/admin/building-detail/BuildingNameCard";
import BuildingCollegeCard from "@/components/admin/building-detail/BuildingCollegeCard";
import BuildingPolygonCard from "@/components/admin/building-detail/BuildingPolygonCard";
import BuildingFacilityListCard from "@/components/admin/building-detail/BuildingFacilityListCard";
import type { Feature, Geometry, Polygon } from "geojson";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

function getBuildingCenter(building: Building | null): [number, number] {
  const geom = (building?.geojson as Feature<Geometry> | null)?.geometry;
  if (!geom) return KU_CENTER;
  if (geom.type === "Point") return [geom.coordinates[1], geom.coordinates[0]];
  if (geom.type !== "Polygon") return KU_CENTER;
  const coords = geom.coordinates[0];
  if (!coords?.length) return KU_CENTER;
  const lats = coords.map(([, lat]) => lat);
  const lngs = coords.map(([lng]) => lng);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
}

export default function BuildingDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const router = useRouter();
  const [building, setBuilding] = useState<Building | null>(null);
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number | null>(
    null,
  );
  const [savingCollege, setSavingCollege] = useState(false);
  const [nameForm, setNameForm] = useState({ name: "", name_en: "" });
  const [savingName, setSavingName] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPolygon, setEditingPolygon] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [confirmModal, setConfirmModal] = useState<FacilityWithType | null>(
    null,
  );
  const [confirmDeleteBuilding, setConfirmDeleteBuilding] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    null,
  );
  const addFacilityRef = useRef<HTMLButtonElement>(null);

  // 객체가 아니라 id를 들고 매 렌더 목록에서 찾는다.
  // 객체를 붙들면 fetchData() 뒤 모달이 옛 값을 보여준다.
  const selectedFacility =
    facilities.find((f) => f.id === selectedFacilityId) ?? null;

  const hasUnsavedNameChanges = Boolean(
    building &&
    (nameForm.name !== building.name ||
      nameForm.name_en !== (building.name_en ?? "")),
  );
  const hasUnsavedCollegeChanges = Boolean(
    building && selectedCollegeId !== building.college_id,
  );
  const unsavedChangeCount =
    Number(hasUnsavedNameChanges) +
    Number(hasUnsavedCollegeChanges) +
    Number(editingPolygon);
  const hasUnsavedChanges = unsavedChangeCount > 0;

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  const fetchData = useCallback(async () => {
    const [
      { data: buildingData },
      { data: facilitiesData },
      { data: typesData },
      { data: collegesData },
    ] = await Promise.all([
      supabase.from("buildings").select("*").eq("id", id).single(),
      supabase
        .from("building_facilities")
        .select("*, facility_types(code, label)")
        .eq("building_id", id)
        .order("created_at", { nullsFirst: true })
        .order("id"),
      supabase.from("facility_types").select("*"),
      supabase.from("colleges").select("*").order("name"),
    ]);
    setBuilding(buildingData);
    setFacilities(facilitiesData ?? []);
    setFacilityTypes(typesData ?? []);
    setColleges(collegesData ?? []);
    setSelectedCollegeId(buildingData?.college_id ?? null);
    setNameForm({
      name: buildingData?.name ?? "",
      name_en: buildingData?.name_en ?? "",
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/admin");
        return;
      }
      await fetchData();
    }
    void init();
  }, [fetchData, router]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  function navigateWithUnsavedCheck(href: string) {
    if (hasUnsavedChanges) {
      setPendingNavigation(href);
      return;
    }
    router.push(href);
  }

  async function handleDeleteFacility(facility: FacilityWithType) {
    const error = await deleteFacility(facility);
    setConfirmModal(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    setSelectedFacilityId(null);
    await fetchData();
    addFacilityRef.current?.focus();
    showToast("시설이 삭제되었어요");
  }

  //소프트 삭제
  async function handleDeleteBuilding() {
    const { error } = await supabase
      .from("buildings")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      showToast("삭제에 실패했어요", "error");
      return;
    }
    invalidateNeighborBuildings();
    router.push("/admin/dashboard");
  }

  async function handleRestoreBuilding() {
    const { error } = await supabase
      .from("buildings")
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", id);
    if (error) {
      showToast("복구에 실패했어요", "error");
      return;
    }
    invalidateNeighborBuildings();
    showToast("건물이 복구되었어요!");
    fetchData();
  }

  async function handleSaveName() {
    if (!nameForm.name.trim()) {
      showToast("건물명을 입력해주세요", "warning");
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from("buildings")
      .update({
        name: nameForm.name.trim(),
        name_en: nameForm.name_en.trim() || null,
      })
      .eq("id", id);
    setSavingName(false);
    if (error) {
      showToast("저장에 실패했어요", "error");
      return;
    }
    invalidateNeighborBuildings();
    await fetchData();
    showToast("건물명이 저장되었어요!");
  }

  async function handleSaveCollege() {
    setSavingCollege(true);
    const { error } = await supabase
      .from("buildings")
      .update({ college_id: selectedCollegeId })
      .eq("id", id);
    setSavingCollege(false);
    if (error) {
      showToast("저장에 실패했어요", "error");
      return;
    }
    await fetchData();
    showToast("소속 단과대학이 저장되었어요!");
  }

  async function handleSavePolygon(newGeojson: Feature<Polygon>) {
    const { error } = await supabase
      .from("buildings")
      .update({ geojson: newGeojson as unknown as Json })
      .eq("id", id);
    if (error) {
      showToast("저장에 실패했어요", "error");
      return;
    }
    invalidateNeighborBuildings();
    setEditingPolygon(false);
    await fetchData();
    showToast("폴리곤이 저장되었어요!");
  }

  async function handleToggleInstalled(facility: FacilityWithType) {
    setTogglingId(facility.id);
    const { error } = await supabase
      .from("building_facilities")
      .update({ is_installed: !facility.is_installed })
      .eq("id", facility.id);
    setTogglingId(null);
    if (error) {
      showToast("변경에 실패했어요", "error");
      return;
    }
    fetchData();
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
  if (!building)
    return (
      <div style={{ padding: 40, color: "var(--ku-text-3)" }}>
        건물을 찾을 수 없어요
      </div>
    );

  const buildingCenter = getBuildingCenter(building);

  return (
    <div className="ku-admin-shell ku-admin-detail-shell">
      <BuildingDetailHeader
        building={building}
        hasUnsavedChanges={hasUnsavedChanges}
        unsavedChangeCount={unsavedChangeCount}
        onNavigate={navigateWithUnsavedCheck}
      />

      <div className="ku-admin-detail-grid">
        {/* 건물 사진 */}
        <div
          id="building-photos"
          className="ku-admin-detail-card ku-admin-detail-card--photos"
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            건물 사진
          </div>
          <BuildingPhotoManager buildingId={id} showToast={showToast} />
        </div>

        {/* 건물 동영상 */}
        <div
          id="building-videos"
          className="ku-admin-detail-card ku-admin-detail-card--videos"
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            건물 동영상
          </div>
          <BuildingVideoManager
            facilities={facilities}
            onChanged={fetchData}
            showToast={showToast}
          />
        </div>

        <BuildingNameCard
          form={nameForm}
          setForm={setNameForm}
          hasUnsavedChanges={hasUnsavedNameChanges}
          saving={savingName}
          onSave={handleSaveName}
        />

        <BuildingCollegeCard
          colleges={colleges}
          selectedCollegeId={selectedCollegeId}
          onSelect={setSelectedCollegeId}
          hasUnsavedChanges={hasUnsavedCollegeChanges}
          saving={savingCollege}
          onSave={handleSaveCollege}
        />

        <BuildingPolygonCard
          buildingId={id}
          geojson={(building.geojson as unknown as Feature<Polygon>) ?? null}
          editing={editingPolygon}
          onStartEdit={() => setEditingPolygon(true)}
          onSave={handleSavePolygon}
          onCancel={() => setEditingPolygon(false)}
        />

        <BuildingFacilityListCard
          buildingId={id}
          buildingCenter={buildingCenter}
          facilities={facilities}
          facilityTypes={facilityTypes}
          addFacilityRef={addFacilityRef}
          onChanged={fetchData}
          onSelectFacility={setSelectedFacilityId}
          showToast={showToast}
        />
        <div
          id="building-danger"
          className="ku-admin-detail-danger"
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 32,
            paddingBottom: 40,
          }}
        >
          {building.is_deleted ? (
            // 삭제된 건물: 복구 버튼
            <button
              onClick={handleRestoreBuilding}
              style={{
                fontSize: 12,
                color: "#fff",
                background: "var(--ku-primary)",
                border: "1px solid var(--ku-primary)",
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              건물 복구
            </button>
          ) : (
            // 정상 건물: 삭제 버튼
            <button
              onClick={() => setConfirmDeleteBuilding(true)}
              style={{
                fontSize: 12,
                color: "var(--ku-danger)",
                background: "none",
                border: "1px solid var(--ku-danger)",
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              건물 삭제
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          message="시설을 삭제할까요?"
          description={
            confirmModal.video_url
              ? "삭제한 시설은 복구할 수 없어요. 이 시설의 동영상도 함께 삭제됩니다."
              : "삭제한 시설은 복구할 수 없어요."
          }
          confirmLabel="삭제"
          onConfirm={() => handleDeleteFacility(confirmModal)}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {confirmDeleteBuilding && (
        <ConfirmModal
          message={`"${building.name}" 건물을 삭제 처리할까요?`}
          description="지도에서 숨겨지고 sync 시 재추가되지 않아요. 시설 데이터는 유지됩니다."
          confirmLabel="삭제"
          onConfirm={handleDeleteBuilding}
          onCancel={() => setConfirmDeleteBuilding(false)}
        />
      )}

      {pendingNavigation && (
        <ConfirmModal
          message="저장하지 않은 변경사항이 있어요"
          description="지금 이동하면 건물 이름, 소속 또는 폴리곤 편집 내용이 사라질 수 있어요."
          confirmLabel="저장하지 않고 이동"
          onConfirm={() => {
            const href = pendingNavigation;
            setPendingNavigation(null);
            router.push(href);
          }}
          onCancel={() => setPendingNavigation(null)}
        />
      )}
      {selectedFacility && (
        <FacilityDetailModal
          facility={selectedFacility}
          toggling={togglingId === selectedFacility.id}
          onToggleInstalled={() => handleToggleInstalled(selectedFacility)}
          onTranslated={fetchData}
          onRequestDelete={() => setConfirmModal(selectedFacility)}
          onClose={() => setSelectedFacilityId(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
