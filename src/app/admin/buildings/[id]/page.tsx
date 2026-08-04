"use client";

import { useCallback, useEffect, useState } from "react";
import NextImage from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { deleteFacility } from "@/lib/facilityDelete";
import { invalidateNeighborBuildings } from "@/lib/neighborBuildings";
import type {
  Building,
  BuildingPhoto,
  FacilityWithType,
  FacilityType,
  College,
} from "@/types/domain";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import AddFacilityButton from "@/components/admin/AddFacilityButton";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import FacilityInstallationControl from "@/components/admin/FacilityInstallationControl";
import FacilityTranslationControl from "@/components/admin/FacilityTranslationControl";
import type { Feature, Polygon } from "geojson";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), {
  ssr: false,
});

const BuildingPolygonPreview = dynamic(
  () => import("@/components/BuildingPolygonPreview"),
  { ssr: false },
);

const KU_CENTER: [number, number] = [37.5893, 127.0327];

function getBuildingCenter(building): [number, number] {
  const geom = building?.geojson?.geometry;
  if (!geom) return KU_CENTER;
  if (geom.type === "Point") return [geom.coordinates[1], geom.coordinates[0]];
  const coords = geom.coordinates?.[0];
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
  const [videoModalFacility, setVideoModalFacility] =
    useState<FacilityWithType | null>(null);

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

  function showToast(message, type = "success") {
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
        .select("*, facility_types(label, icon)")
        .eq("building_id", id),
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

  async function handleDeleteFacility(facility) {
    const error = await deleteFacility(facility);
    setConfirmModal(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
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

  async function handleToggleInstalled(facility) {
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
      {/* 헤더 */}
      <div
        className="ku-admin-detail-header"
        style={{
          background: "var(--ku-surface)",
          borderBottom: "1px solid var(--ku-border)",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigateWithUnsavedCheck("/admin/dashboard")}
            aria-label="건물 목록으로 돌아가기"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "var(--ku-text-2)",
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{building.name}</div>
            <div style={{ fontSize: 12, color: "var(--ku-text-2)" }}>
              {building.name_en}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            className="ku-admin-detail-save-status"
            data-unsaved={hasUnsavedChanges}
            role="status"
            aria-label={
              hasUnsavedChanges
                ? `저장하지 않은 변경 ${unsavedChangeCount}개`
                : "모든 변경 저장됨"
            }
          >
            {hasUnsavedChanges
              ? `저장하지 않은 변경 ${unsavedChangeCount}개`
              : "모든 변경 저장됨"}
          </div>
          <button
            onClick={() => navigateWithUnsavedCheck("/")}
            style={{
              fontSize: 13,
              color: "var(--ku-text-2)",
              background: "none",
              border: "1px solid var(--ku-border)",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            지도 보기
          </button>
        </div>
      </div>

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
          <PhotoManager buildingId={id} showToast={showToast} />
        </div>

        {/* 건물명 수정 */}
        <div
          id="building-name"
          className="ku-admin-detail-card ku-admin-detail-card--name"
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600 }}>건물명 수정</span>
            {hasUnsavedNameChanges && (
              <span className="ku-admin-detail-unsaved-label">저장 안 됨</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label
                htmlFor="building-edit-name"
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--ku-text-2)",
                  marginBottom: 4,
                }}
              >
                한국어
              </label>
              <input
                id="building-edit-name"
                type="text"
                value={nameForm.name}
                onChange={(e) =>
                  setNameForm((f) => ({ ...f, name: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="building-edit-name-en"
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--ku-text-2)",
                  marginBottom: 4,
                }}
              >
                영어
              </label>
              <input
                id="building-edit-name-en"
                type="text"
                value={nameForm.name_en}
                onChange={(e) =>
                  setNameForm((f) => ({ ...f, name_en: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleSaveName}
              disabled={savingName}
              style={{
                alignSelf: "flex-end",
                padding: "8px 20px",
                background: savingName
                  ? "var(--ku-primary-disabled)"
                  : "var(--ku-primary)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                cursor: savingName ? "default" : "pointer",
              }}
            >
              {savingName ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>

        {/* 소속 단과대학 */}
        <div
          id="building-college"
          className="ku-admin-detail-card ku-admin-detail-card--college"
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600 }}>소속 단과대학</span>
            {hasUnsavedCollegeChanges && (
              <span className="ku-admin-detail-unsaved-label">저장 안 됨</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              aria-label="소속 단과대학 선택"
              value={selectedCollegeId ?? ""}
              onChange={(e) =>
                setSelectedCollegeId(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              style={{
                flex: 1,
                padding: "8px 10px",
                border: "1px solid var(--ku-border)",
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                background: "var(--ku-surface)",
              }}
            >
              <option value="">선택 안 함</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveCollege}
              disabled={savingCollege}
              style={{
                padding: "8px 16px",
                background: "var(--ku-primary)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                cursor: savingCollege ? "not-allowed" : "pointer",
                opacity: savingCollege ? 0.7 : 1,
              }}
            >
              {savingCollege ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>

        {/* 폴리곤 편집 */}
        <div
          id="building-polygon"
          className="ku-admin-detail-card ku-admin-detail-card--polygon"
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: editingPolygon ? 16 : 0,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  건물 폴리곤
                </span>
                {editingPolygon && (
                  <span className="ku-admin-detail-unsaved-label">편집 중</span>
                )}
              </div>
              {!editingPolygon && (
                <div
                  style={{
                    fontSize: 12,
                    color: building?.geojson
                      ? "var(--ku-status-installed-fg)"
                      : "var(--ku-text-3)",
                    marginTop: 4,
                  }}
                >
                  {building?.geojson
                    ? "✅ 폴리곤 데이터 있음"
                    : "❌ 폴리곤 없음 — 편집으로 추가"}
                </div>
              )}
            </div>
            {!editingPolygon && (
              <button
                onClick={() => setEditingPolygon(true)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  background: "none",
                  border: "1px solid var(--ku-primary-text)",
                  color: "var(--ku-primary-text)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                편집
              </button>
            )}
          </div>

          {!editingPolygon && building.geojson && (
            <div style={{ marginTop: 16 }}>
              <BuildingPolygonPreview
                key={JSON.stringify(building.geojson)}
                geojson={building.geojson as unknown as Feature<Polygon>}
                buildingId={id}
              />
            </div>
          )}

          {editingPolygon && (
            <PolygonEditor
              geojson={
                (building?.geojson as unknown as Feature<Polygon> | null) ??
                null
              }
              excludeId={id}
              onSave={async (newGeojson) => {
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
              }}
              onCancel={() => setEditingPolygon(false)}
            />
          )}
        </div>

        {/* 시설 목록 */}
        <div
          id="building-facilities"
          className="ku-admin-detail-card ku-admin-detail-card--facilities"
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
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>시설 현황</div>
            <AddFacilityButton
              buildingId={id}
              center={buildingCenter}
              facilityTypes={facilityTypes}
              onAdd={fetchData}
              showToast={showToast}
            />
          </div>

          {facilities.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--ku-text-3)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              등록된 시설이 없어요
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
                <div style={{ fontSize: 20 }}>{f.facility_types?.icon}</div>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {f.name ?? f.facility_types?.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ku-text-2)" }}>
                    {f.description}
                    {f.floor_info && ` · ${f.floor_info}`}
                  </div>
                  {f.lat && (
                    <div style={{ fontSize: 11, color: "var(--ku-text-3)" }}>
                      위도 {f.lat} / 경도 {f.lng}
                    </div>
                  )}
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
                  onClick={() => setConfirmModal(f)}
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
        </div>
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

      {/* 삭제 확인 모달 */}
      {confirmModal && (
        <ConfirmModal
          message="시설을 삭제할까요?"
          description="삭제한 시설은 복구할 수 없어요."
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

type PhotoUploadStatus =
  "queued" | "compressing" | "uploading" | "success" | "error";

interface PhotoUploadItem {
  id: string;
  file: File;
  status: PhotoUploadStatus;
  error?: string;
}

const photoUploadStatusLabel: Record<PhotoUploadStatus, string> = {
  queued: "대기 중",
  compressing: "압축 중",
  uploading: "업로드 중",
  success: "완료",
  error: "실패",
};

function PhotoManager({ buildingId, showToast }) {
  const [photos, setPhotos] = useState<BuildingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<PhotoUploadItem[]>([]);
  const [confirmDeletePhoto, setConfirmDeletePhoto] =
    useState<BuildingPhoto | null>(null);
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>(
    {},
  );
  const [savingCaption, setSavingCaption] = useState<number | null>(null);

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from("building_photos")
      .select("*")
      .eq("building_id", buildingId)
      .order("created_at");
    setPhotos(data ?? []);
    const initial = {};
    (data ?? []).forEach((p) => {
      initial[p.id] = p.caption ?? "";
    });
    setDraftCaptions(initial);
  }, [buildingId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchPhotos(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchPhotos]);

  async function handleSaveCaption(photoId) {
    const caption = draftCaptions[photoId] ?? "";
    const original = photos.find((p) => p.id === photoId)?.caption ?? "";
    if (caption === original) return;
    setSavingCaption(photoId);

    const updateData = {
      caption: caption || null,
      caption_en: null,
      caption_zh: null,
    };

    if (caption) {
      try {
        const res = await authedFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: { caption } }),
        });
        if (!res.ok) throw new Error("translate failed");
        const { en, zh } = await res.json();
        updateData.caption_en = en.caption ?? null;
        updateData.caption_zh = zh.caption ?? null;
      } catch {
        // 번역 실패해도 캡션 저장은 진행
      }
    }

    const { error } = await supabase
      .from("building_photos")
      .update(updateData)
      .eq("id", photoId);
    setSavingCaption(null);
    if (error) {
      showToast("캡션 저장 실패", "error");
      return;
    }
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, ...updateData } : p)),
    );
  }

  function convertToWebP(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1920;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w >= h) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("WebP 변환 실패"));
          },
          "image/webp",
          0.75,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("이미지 로드 실패"));
      };
      img.src = objectUrl;
    });
  }

  function updateUploadItem(
    id: string,
    status: PhotoUploadStatus,
    error?: string,
  ) {
    setUploadItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status, error } : item,
      ),
    );
  }

  async function uploadPhoto(item: PhotoUploadItem) {
    updateUploadItem(item.id, "compressing");
    let blob: Blob;
    try {
      blob = (await convertToWebP(item.file)) as Blob;
    } catch (error) {
      return {
        ...item,
        status: "error" as const,
        error:
          error instanceof Error ? error.message : "이미지 압축에 실패했어요",
      };
    }

    updateUploadItem(item.id, "uploading");
    const formData = new FormData();
    formData.append("file", blob, "photo.webp");
    formData.append("buildingId", String(buildingId));
    formData.append("originalName", item.file.name);

    try {
      const res = await authedFetch("/api/upload-building-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        return {
          ...item,
          status: "error" as const,
          error: data.error ?? `서버 응답 오류 (${res.status})`,
        };
      }
      return { ...item, status: "success" as const, error: undefined };
    } catch {
      return {
        ...item,
        status: "error" as const,
        error: "네트워크 오류가 발생했어요",
      };
    }
  }

  async function runUploads(
    targets: PhotoUploadItem[],
    existingSuccessCount: number,
  ) {
    if (targets.length === 0) return;
    setUploading(true);
    const results: PhotoUploadItem[] = [];
    for (const target of targets) {
      const result = await uploadPhoto(target);
      results.push(result);
      updateUploadItem(result.id, result.status, result.error);
    }

    await fetchPhotos();
    setUploading(false);
    const successCount =
      existingSuccessCount +
      results.filter((item) => item.status === "success").length;
    const failureCount = results.filter(
      (item) => item.status === "error",
    ).length;
    showToast(
      failureCount > 0
        ? `${successCount}장 업로드 완료 · ${failureCount}장 실패`
        : `${successCount}장 업로드됐어요!`,
      failureCount > 0 ? "warning" : "success",
    );
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files as FileList);
    e.target.value = "";
    if (!files.length) return;
    const batchId = Date.now();
    const items = files.map((file, index) => ({
      id: `${batchId}-${index}`,
      file,
      status: "queued" as const,
    }));
    setUploadItems(items);
    await runUploads(items, 0);
  }

  async function handleRetryFailed() {
    const failed = uploadItems
      .filter((item) => item.status === "error")
      .map((item) => ({
        ...item,
        status: "queued" as const,
        error: undefined,
      }));
    const failedIds = new Set(failed.map((item) => item.id));
    setUploadItems((current) =>
      current.map((item) =>
        failedIds.has(item.id)
          ? { ...item, status: "queued", error: undefined }
          : item,
      ),
    );
    await runUploads(
      failed,
      uploadItems.filter((item) => item.status === "success").length,
    );
  }

  async function handleDelete(photo) {
    const res = await authedFetch("/api/delete-building-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: photo.id, url: photo.url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`삭제 실패: ${data.error}`, "error");
      return;
    }
    setConfirmDeletePhoto(null);
    await fetchPhotos();
    showToast("사진이 삭제되었어요");
  }

  return (
    <>
      {photos.length === 0 ? (
        <div
          style={{
            width: "100%",
            height: 120,
            background: "var(--ku-border)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ku-text-3)",
            fontSize: 13,
          }}
        >
          등록된 사진 없음
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ position: "relative", aspectRatio: "4/3" }}>
                <NextImage
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  fill
                  sizes="(max-width: 767px) 30vw, 180px"
                  unoptimized
                  style={{
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
                <button
                  onClick={() => setConfirmDeletePhoto(photo)}
                  className="ku-photo-delete-button"
                  aria-label="사진 삭제"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--ku-overlay)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
              <input
                value={draftCaptions[photo.id] ?? ""}
                onChange={(e) =>
                  setDraftCaptions((prev) => ({
                    ...prev,
                    [photo.id]: e.target.value,
                  }))
                }
                onBlur={() => handleSaveCaption(photo.id)}
                aria-label="사진 설명"
                placeholder="설명 추가..."
                maxLength={100}
                style={{
                  width: "100%",
                  fontSize: 11,
                  padding: "4px 6px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 4,
                  outline: "none",
                  color: "var(--ku-text-1)",
                  background:
                    savingCaption === photo.id
                      ? "var(--ku-divider)"
                      : "var(--ku-surface)",
                }}
              />
            </div>
          ))}
        </div>
      )}
      <label
        className="ku-admin-row-action"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 12,
          padding: "8px 16px",
          background: "var(--ku-primary)",
          color: "#fff",
          borderRadius: 8,
          fontSize: 13,
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.7 : 1,
        }}
      >
        {uploading ? "업로드 중..." : "사진 추가"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>
      {uploadItems.length > 0 && (
        <div
          className="ku-photo-upload-panel"
          aria-label="사진 업로드 진행 상황"
        >
          <div
            className="ku-photo-upload-summary"
            role="status"
            aria-live="polite"
            aria-label={`성공 ${
              uploadItems.filter((item) => item.status === "success").length
            }개 · 실패 ${
              uploadItems.filter((item) => item.status === "error").length
            }개${uploading ? " · 처리 중" : ""}`}
          >
            성공{" "}
            {uploadItems.filter((item) => item.status === "success").length}개 ·
            실패 {uploadItems.filter((item) => item.status === "error").length}
            개{uploading ? " · 처리 중" : ""}
          </div>
          <ul className="ku-photo-upload-list">
            {uploadItems.map((item) => (
              <li key={item.id} data-status={item.status}>
                <span className="ku-photo-upload-name" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="ku-photo-upload-state">
                  {photoUploadStatusLabel[item.status]}
                  {item.error ? ` · ${item.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {!uploading &&
            uploadItems.some((item) => item.status === "error") && (
              <button
                type="button"
                className="ku-photo-upload-retry"
                onClick={handleRetryFailed}
              >
                실패한 사진 다시 시도
              </button>
            )}
          {!uploading &&
            uploadItems.every((item) => item.status === "success") && (
              <button
                type="button"
                className="ku-photo-upload-clear"
                onClick={() => setUploadItems([])}
              >
                업로드 결과 닫기
              </button>
            )}
        </div>
      )}
      {confirmDeletePhoto && (
        <ConfirmModal
          message="사진을 삭제할까요?"
          description="삭제한 사진은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDeletePhoto)}
          onCancel={() => setConfirmDeletePhoto(null)}
        />
      )}
    </>
  );
}
