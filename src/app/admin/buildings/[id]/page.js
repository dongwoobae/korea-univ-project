"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), { ssr: false });
const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), { ssr: false });

export default function BuildingDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [building, setBuilding] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPolygon, setEditingPolygon] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { facilityId }

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/admin"); return; }
      fetchData();
    }
    init();
  }, []);

  async function fetchData() {
    const [
      { data: buildingData },
      { data: facilitiesData },
      { data: typesData },
    ] = await Promise.all([
      supabase.from("buildings").select("*").eq("id", id).single(),
      supabase.from("building_facilities").select("*, facility_types(label, icon)").eq("building_id", id),
      supabase.from("facility_types").select("*"),
    ]);
    setBuilding(buildingData);
    setFacilities(facilitiesData ?? []);
    setFacilityTypes(typesData ?? []);
    setLoading(false);
  }

  async function handleDeleteFacility(facilityId) {
    await supabase.from("building_facilities").delete().eq("id", facilityId);
    setConfirmModal(null);
    fetchData();
    showToast("시설이 삭제되었어요");
  }

  async function handleToggleInstalled(facility) {
    await supabase
      .from("building_facilities")
      .update({ is_installed: !facility.is_installed })
      .eq("id", facility.id);
    fetchData();
    showToast(facility.is_installed ? "미설치로 변경되었어요" : "설치로 변경되었어요");
  }

  if (loading) return <div style={{ padding: 40, color: "#aaa" }}>불러오는 중...</div>;
  if (!building) return <div style={{ padding: 40, color: "#aaa" }}>건물을 찾을 수 없어요</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      {/* 헤더 */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push("/admin/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>←</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{building.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{building.name_en}</div>
          </div>
        </div>
        <button onClick={() => router.push("/")} style={{ fontSize: 13, color: "#555", background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          지도 보기
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* 건물 사진 */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>건물 사진</div>
          {building.photo_url ? (
            <img src={building.photo_url} alt={building.name} style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 8 }} />
          ) : (
            <div style={{ width: "100%", height: 200, background: "#f5f5f5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>
              사진 없음
            </div>
          )}
          <PhotoUpload buildingId={id} onUpload={fetchData} showToast={showToast} />
        </div>

        {/* 폴리곤 편집 */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingPolygon ? 16 : 0 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>건물 폴리곤</div>
              {!editingPolygon && (
                <div style={{ fontSize: 12, color: building?.geojson ? "#3B6D11" : "#aaa", marginTop: 4 }}>
                  {building?.geojson ? "✅ 폴리곤 데이터 있음" : "❌ 폴리곤 없음 — 편집으로 추가"}
                </div>
              )}
            </div>
            {!editingPolygon && (
              <button
                onClick={() => setEditingPolygon(true)}
                style={{ fontSize: 13, padding: "6px 14px", background: "none", border: "1px solid #2563EB", color: "#2563EB", borderRadius: 8, cursor: "pointer" }}
              >
                편집
              </button>
            )}
          </div>

          {editingPolygon && (
            <PolygonEditor
              geojson={building?.geojson ?? null}
              onSave={async (newGeojson) => {
                const { error } = await supabase.from("buildings").update({ geojson: newGeojson }).eq("id", id);
                if (error) { showToast("저장에 실패했어요", "error"); return; }
                setEditingPolygon(false);
                fetchData();
                showToast("폴리곤이 저장되었어요!");
              }}
              onCancel={() => setEditingPolygon(false)}
            />
          )}
        </div>

        {/* 시설 목록 */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>시설 현황</div>
            <AddFacilityButton
              buildingId={id}
              building={building}
              facilityTypes={facilityTypes}
              onAdd={fetchData}
              showToast={showToast}
            />
          </div>

          {facilities.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: "20px 0" }}>등록된 시설이 없어요</div>
          ) : (
            facilities.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ fontSize: 20 }}>{f.facility_types?.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{f.name ?? f.facility_types?.label}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {f.description}{f.floor_info && ` · ${f.floor_info}`}
                  </div>
                  {f.lat && <div style={{ fontSize: 11, color: "#bbb" }}>위도 {f.lat} / 경도 {f.lng}</div>}
                </div>
                <button
                  onClick={() => handleToggleInstalled(f)}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: 500, background: f.is_installed ? "#EAF3DE" : "#FCEBEB", color: f.is_installed ? "#3B6D11" : "#A32D2D" }}
                >
                  {f.is_installed ? "설치" : "미설치"}
                </button>
                <button
                  onClick={() => setConfirmModal({ facilityId: f.id })}
                  style={{ fontSize: 12, color: "#DC2626", background: "none", border: "none", cursor: "pointer" }}
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 삭제 확인 모달 */}
      {confirmModal && (
        <ConfirmModal
          message="시설을 삭제할까요?"
          description="삭제한 시설은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDeleteFacility(confirmModal.facilityId)}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

function PhotoUpload({ buildingId, onUpload, showToast }) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const fileName = `${buildingId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("building-photos")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      showToast("업로드에 실패했어요", "error");
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("building-photos").getPublicUrl(fileName);
    await supabase.from("buildings").update({ photo_url: data.publicUrl }).eq("id", buildingId);

    onUpload();
    setUploading(false);
    showToast("사진이 업로드되었어요!");
  }

  return (
    <label style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "#2563EB", color: "#fff", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
      {uploading ? "업로드 중..." : "사진 업로드"}
      <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
    </label>
  );
}

function AddFacilityButton({ buildingId, building, facilityTypes, onAdd, showToast }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ facility_code: "", name: "", description: "", floor_info: "", is_installed: true, lat: "", lng: "" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.facility_code) {
      showToast("시설 유형을 선택해주세요", "warning");
      return;
    }
    setSaving(true);
    await supabase.from("building_facilities").insert({
      building_id: buildingId,
      facility_code: form.facility_code,
      name: form.name || null,
      description: form.description || null,
      floor_info: form.floor_info || null,
      is_installed: form.is_installed,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    });
    setSaving(false);
    setOpen(false);
    setForm({ facility_code: "", name: "", description: "", floor_info: "", is_installed: true, lat: "", lng: "" });
    onAdd();
    showToast("시설이 추가되었어요!");
  }

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", marginTop: 4 };
  const labelStyle = { fontSize: 12, color: "#555", display: "block", marginTop: 12 };

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ fontSize: 13, padding: "8px 16px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
        + 시설 추가
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 500, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>시설 추가</div>

            <label style={labelStyle}>시설 유형 *</label>
            <select value={form.facility_code} onChange={(e) => setForm({ ...form, facility_code: e.target.value })} style={inputStyle}>
              <option value="">선택해주세요</option>
              {facilityTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.icon} {t.label}</option>
              ))}
            </select>

            <label style={labelStyle}>시설 이름 (선택)</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 정문 엘리베이터" style={inputStyle} />

            <label style={labelStyle}>설명 (선택)</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="예: 정문 우측 내부" style={inputStyle} />

            <label style={labelStyle}>층 정보 (선택)</label>
            <input value={form.floor_info} onChange={(e) => setForm({ ...form, floor_info: e.target.value })} placeholder="예: 1층~4층" style={inputStyle} />

            <label style={labelStyle}>위치 (지도에서 클릭해서 선택)</label>
            <div style={{ marginTop: 4, borderRadius: 8, overflow: "hidden", border: "1px solid #ddd" }}>
              <FacilityMap
                center={[37.5893, 127.0327]}
                markerPosition={form.lat && form.lng ? [parseFloat(form.lat), parseFloat(form.lng)] : null}
                onMapClick={(lat, lng) => setForm((prev) => ({ ...prev, lat: lat.toFixed(7), lng: lng.toFixed(7) }))}
              />
            </div>

            {form.lat && form.lng && (
              <div style={{ fontSize: 12, color: "#2563EB", marginTop: 8 }}>선택된 위치: {form.lat}, {form.lng}</div>
            )}

            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.is_installed} onChange={(e) => setForm({ ...form, is_installed: e.target.checked })} />
              설치됨
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setOpen(false)} style={{ flex: 1, padding: "10px", background: "none", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
