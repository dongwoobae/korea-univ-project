"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteFacility } from "@/lib/facilityDelete";
import type { FacilityWithType, FacilityType } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import AddFacilityButton from "@/components/admin/AddFacilityButton";
import FacilityFormModal from "@/components/admin/FacilityFormModal";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [loading, setLoading] = useState(true);
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

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [{ data: facilitiesData }, { data: typesData }] = await Promise.all([
      supabase
        .from("building_facilities")
        .select("*, facility_types(label, icon)")
        .is("building_id", null)
        .order("created_at"),
      supabase.from("facility_types").select("*"),
    ]);
    setFacilities(facilitiesData ?? []);
    setFacilityTypes(typesData ?? []);
    setLoading(false);
  }

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

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
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
        <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
          건물에 소속되지 않는 시설(야외 경사로, 독립 주차구역 등)을 관리해요.
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
            등록된 독립 시설이 없어요
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
                {f.description && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {f.description}
                  </div>
                )}
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
                onClick={() => setEditingFacility(f)}
                style={{
                  fontSize: 12,
                  color: "#2563EB",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(f)}
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
