"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { deleteFacility } from "@/lib/facilityDelete";
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

const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), {
  ssr: false,
});

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
  const [loading, setLoading] = useState(true);
  const [editingPolygon, setEditingPolygon] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [confirmModal, setConfirmModal] = useState<FacilityWithType | null>(
    null,
  );
  const [confirmDeleteBuilding, setConfirmDeleteBuilding] = useState(false);
  const [videoModalFacility, setVideoModalFacility] =
    useState<FacilityWithType | null>(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/admin");
        return;
      }
      fetchData();
    }
    init();
  }, []);

  async function fetchData() {
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
    fetchData();
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
    fetchData();
    showToast("소속 단과대학이 저장되었어요!");
  }

  async function handleToggleInstalled(facility) {
    await supabase
      .from("building_facilities")
      .update({ is_installed: !facility.is_installed })
      .eq("id", facility.id);
    fetchData();
    showToast(
      facility.is_installed ? "미설치로 변경되었어요" : "설치로 변경되었어요",
    );
  }

  if (loading)
    return <div style={{ padding: 40, color: "#aaa" }}>불러오는 중...</div>;
  if (!building)
    return (
      <div style={{ padding: 40, color: "#aaa" }}>건물을 찾을 수 없어요</div>
    );

  const buildingCenter = getBuildingCenter(building);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      {/* 헤더 */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/admin/dashboard")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "#888",
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{building.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {building.name_en}
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          style={{
            fontSize: 13,
            color: "#555",
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          지도 보기
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* 건물 사진 */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
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
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            건물명 수정
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                한국어
              </div>
              <input
                type="text"
                value={nameForm.name}
                onChange={(e) =>
                  setNameForm((f) => ({ ...f, name: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                영어
              </div>
              <input
                type="text"
                value={nameForm.name_en}
                onChange={(e) =>
                  setNameForm((f) => ({ ...f, name_en: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #ddd",
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
                background: savingName ? "#93c5fd" : "#2563EB",
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
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            소속 단과대학
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={selectedCollegeId ?? ""}
              onChange={(e) =>
                setSelectedCollegeId(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              style={{
                flex: 1,
                padding: "8px 10px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                background: "#fff",
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
                background: "#2563EB",
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
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
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
              <div style={{ fontSize: 15, fontWeight: 600 }}>건물 폴리곤</div>
              {!editingPolygon && (
                <div
                  style={{
                    fontSize: 12,
                    color: building?.geojson ? "#3B6D11" : "#aaa",
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
                  border: "1px solid #2563EB",
                  color: "#2563EB",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                편집
              </button>
            )}
          </div>

          {editingPolygon && (
            <PolygonEditor
              geojson={building?.geojson ?? null}
              excludeId={id}
              onSave={async (newGeojson) => {
                const { error } = await supabase
                  .from("buildings")
                  .update({ geojson: newGeojson })
                  .eq("id", id);
                if (error) {
                  showToast("저장에 실패했어요", "error");
                  return;
                }
                setEditingPolygon(false);
                fetchData();
                showToast("폴리곤이 저장되었어요!");
              }}
              onCancel={() => setEditingPolygon(false)}
            />
          )}
        </div>

        {/* 시설 목록 */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
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
                color: "#aaa",
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
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                <div style={{ fontSize: 20 }}>{f.facility_types?.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {f.name ?? f.facility_types?.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {f.description}
                    {f.floor_info && ` · ${f.floor_info}`}
                  </div>
                  {f.lat && (
                    <div style={{ fontSize: 11, color: "#bbb" }}>
                      위도 {f.lat} / 경도 {f.lng}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setVideoModalFacility(f)}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid",
                    cursor: "pointer",
                    fontWeight: 500,
                    background: f.video_url ? "#EFF6FF" : "none",
                    borderColor: f.video_url ? "#2563EB" : "#d1d5db",
                    color: f.video_url ? "#2563EB" : "#6b7280",
                  }}
                >
                  {f.video_url ? "동영상 ✓" : "동영상"}
                </button>
                <button
                  onClick={() => handleToggleInstalled(f)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 20,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 500,
                    background: f.is_installed ? "#EAF3DE" : "#FCEBEB",
                    color: f.is_installed ? "#3B6D11" : "#A32D2D",
                  }}
                >
                  {f.is_installed ? "설치" : "미설치"}
                </button>
                <button
                  onClick={() => setConfirmModal(f)}
                  style={{
                    fontSize: 12,
                    color: "#DC2626",
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
                fontSize: 13,
                color: "#fff",
                background: "#2563EB",
                border: "none",
                borderRadius: 6,
                padding: "8px 20px",
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
                fontSize: 13,
                color: "#DC2626",
                background: "none",
                border: "1px solid #DC2626",
                borderRadius: 6,
                padding: "8px 20px",
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

function PhotoManager({ buildingId, showToast }) {
  const [photos, setPhotos] = useState<BuildingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmDeletePhoto, setConfirmDeletePhoto] =
    useState<BuildingPhoto | null>(null);
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>(
    {},
  );
  const [savingCaption, setSavingCaption] = useState<number | null>(null);

  useEffect(() => {
    fetchPhotos();
  }, []);

  async function fetchPhotos() {
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
  }

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

  async function handleUpload(e) {
    const files = Array.from(e.target.files as FileList);
    if (!files.length) return;
    setUploading(true);

    let successCount = 0;
    for (const file of files) {
      let blob;
      try {
        blob = await convertToWebP(file);
      } catch {
        showToast(`${file.name} 변환 실패`, "error");
        continue;
      }

      const formData = new FormData();
      formData.append("file", blob, "photo.webp");
      formData.append("buildingId", buildingId);

      try {
        const res = await authedFetch("/api/upload-building-photo", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          showToast(`업로드 실패: ${data.error}`, "error");
          continue;
        }
        successCount++;
      } catch {
        showToast("네트워크 오류가 발생했어요", "error");
      }
    }

    await fetchPhotos();
    setUploading(false);
    e.target.value = "";
    if (successCount > 0) showToast(`${successCount}장 업로드됐어요!`);
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
            background: "#f5f5f5",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#aaa",
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
                <img
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
                <button
                  onClick={() => setConfirmDeletePhoto(photo)}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.55)",
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
                placeholder="설명 추가..."
                maxLength={100}
                style={{
                  width: "100%",
                  fontSize: 11,
                  padding: "4px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                  outline: "none",
                  color: "#374151",
                  background: savingCaption === photo.id ? "#f9fafb" : "#fff",
                }}
              />
            </div>
          ))}
        </div>
      )}
      <label
        style={{
          display: "inline-block",
          marginTop: 12,
          padding: "8px 16px",
          background: "#2563EB",
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
