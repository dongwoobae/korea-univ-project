"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteLandmark } from "@/lib/landmarkDelete";
import type { Landmark } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import LandmarkFormModal from "@/components/admin/LandmarkFormModal";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function LandmarksPage() {
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [editingLandmark, setEditingLandmark] = useState<Landmark | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Landmark | null>(null);

  function showToast(message: string, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data } = await supabase
      .from("landmarks")
      .select("*")
      .order("created_at", { ascending: true });
    setLandmarks(data ?? []);
    setLoading(false);
  }

  async function handleDelete(landmark: Landmark) {
    const error = await deleteLandmark(landmark);
    setConfirmDelete(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
    showToast("명소가 삭제되었어요");
  }

  if (loading)
    return <div style={{ padding: 40, color: "#aaa" }}>불러오는 중...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
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
          <div style={{ fontSize: 15, fontWeight: 600 }}>명소</div>
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + 명소 추가
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
          지도에 표시할 캠퍼스 명소를 관리해요.
        </div>

        {landmarks.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#aaa",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            등록된 명소가 없어요
          </div>
        ) : (
          landmarks.map((landmark) => (
            <div
              key={landmark.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid #f5f5f5",
              }}
            >
              <div style={{ fontSize: 22, width: 28, textAlign: "center" }}>
                {landmark.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {landmark.name}
                </div>
                {landmark.description && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {landmark.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#bbb" }}>
                  위도 {landmark.lat} / 경도 {landmark.lng}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: landmark.photo_url ? "#FEF3C7" : "#F3F4F6",
                  color: landmark.photo_url ? "#92400E" : "#6B7280",
                  flexShrink: 0,
                }}
              >
                {landmark.photo_url ? "사진 있음" : "사진 없음"}
              </span>
              <button
                onClick={() => setEditingLandmark(landmark)}
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
                onClick={() => setConfirmDelete(landmark)}
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

      {creating && (
        <LandmarkFormModal
          center={KU_CENTER}
          landmark={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            fetchData();
          }}
          showToast={showToast}
        />
      )}

      {editingLandmark && (
        <LandmarkFormModal
          center={[editingLandmark.lat, editingLandmark.lng]}
          landmark={editingLandmark}
          onClose={() => setEditingLandmark(null)}
          onSaved={() => {
            setEditingLandmark(null);
            fetchData();
          }}
          onPhotoChanged={fetchData}
          showToast={showToast}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="명소를 삭제할까요?"
          description="삭제한 명소와 연결된 사진은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
