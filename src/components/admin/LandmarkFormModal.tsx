"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import type { Landmark } from "@/types/domain";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

interface LandmarkFormModalProps {
  center: [number, number];
  landmark: Landmark | null;
  onClose: () => void;
  onSaved: () => void;
  onPhotoChanged?: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function LandmarkFormModal({
  center,
  landmark,
  onClose,
  onSaved,
  onPhotoChanged,
  showToast,
}: LandmarkFormModalProps) {
  const editing = landmark !== null;
  const [form, setForm] = useState({
    name: landmark?.name ?? "",
    name_en: landmark?.name_en ?? "",
    name_zh: landmark?.name_zh ?? "",
    description: landmark?.description ?? "",
    description_en: landmark?.description_en ?? "",
    description_zh: landmark?.description_zh ?? "",
    icon: landmark?.icon ?? "✨",
    lat: landmark?.lat != null ? String(landmark.lat) : "",
    lng: landmark?.lng != null ? String(landmark.lng) : "",
    photo_url: landmark?.photo_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  async function fillTranslations() {
    const texts: Record<string, string> = {};
    if (form.name) texts.name = form.name;
    if (form.description) texts.description = form.description;
    if (Object.keys(texts).length === 0) return;

    try {
      const res = await authedFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
      if (!res.ok) throw new Error("translate failed");
      const { en, zh } = await res.json();
      setForm((prev) => ({
        ...prev,
        name_en: prev.name_en || en.name || "",
        name_zh: prev.name_zh || zh.name || "",
        description_en: prev.description_en || en.description || "",
        description_zh: prev.description_zh || zh.description || "",
      }));
    } catch {
      showToast("자동번역에 실패했어요", "warning");
    }
  }

  function validate(): string | null {
    if (!form.name.trim()) return "명소 이름을 입력해주세요";
    if (!form.icon.trim()) return "이모지를 입력해주세요";
    if (!form.lat || !form.lng) return "지도에서 위치를 선택해주세요";
    return null;
  }

  async function uploadPhoto(landmarkId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("landmarkId", landmarkId);

    const res = await authedFetch("/api/upload-landmark-photo", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "사진 업로드 실패");
    setForm((prev) => ({ ...prev, photo_url: data.photoUrl }));
  }

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!landmark?.id) {
      setPendingPhoto(file);
      showToast("명소를 저장할 때 사진도 함께 업로드해요");
      return;
    }
    setUploading(true);
    try {
      await uploadPhoto(landmark.id, file);
      showToast("사진이 업로드되었어요");
      onPhotoChanged?.();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "사진 업로드 실패",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto() {
    if (!landmark?.id || !form.photo_url) return;
    const res = await authedFetch("/api/delete-landmark-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landmarkId: landmark.id,
        photoUrl: form.photo_url,
      }),
    });
    if (!res.ok) {
      showToast("사진 삭제에 실패했어요", "error");
      return;
    }
    setForm((prev) => ({ ...prev, photo_url: "" }));
    showToast("사진이 삭제되었어요");
    onPhotoChanged?.();
  }

  async function handleSave() {
    const invalid = validate();
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      name_en: form.name_en.trim() || null,
      name_zh: form.name_zh.trim() || null,
      description: form.description.trim() || null,
      description_en: form.description_en.trim() || null,
      description_zh: form.description_zh.trim() || null,
      icon: form.icon.trim(),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      photo_url: form.photo_url || null,
    };

    if (landmark) {
      const { error } = await supabase
        .from("landmarks")
        .update(payload)
        .eq("id", landmark.id);
      setSaving(false);
      if (error) {
        console.error(error);
        showToast("저장에 실패했어요", "error");
        return;
      }
      onSaved();
      showToast("명소가 수정되었어요");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("landmarks")
      .insert(payload)
      .select("id")
      .single();
    if (error || !inserted) {
      setSaving(false);
      console.error(error);
      showToast("저장에 실패했어요", "error");
      return;
    }
    if (pendingPhoto) {
      try {
        setUploading(true);
        await uploadPhoto(inserted.id, pendingPhoto);
      } catch {
        onSaved();
        showToast("명소는 저장됐지만 사진 업로드에 실패했어요", "warning");
        return;
      } finally {
        setUploading(false);
      }
    }
    setSaving(false);
    onSaved();
    showToast("명소가 추가되었어요");
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 4,
  };
  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: "#555",
    display: "block",
    marginTop: 12,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "min(560px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editing ? "명소 수정" : "명소 추가"}
        </div>

        <label style={labelStyle}>이름 *</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="예: 다람쥐길"
          style={inputStyle}
        />

        <label style={labelStyle}>설명</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="명소 설명"
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
        />

        <button
          onClick={fillTranslations}
          type="button"
          style={{
            marginTop: 10,
            padding: "7px 10px",
            border: "1px solid #2563EB",
            borderRadius: 6,
            background: "#fff",
            color: "#2563EB",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          자동번역 채우기
        </button>

        <label style={labelStyle}>영문 이름</label>
        <input
          value={form.name_en}
          onChange={(e) => setForm({ ...form, name_en: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>중문 이름</label>
        <input
          value={form.name_zh}
          onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>영문 설명</label>
        <textarea
          value={form.description_en}
          onChange={(e) => setForm({ ...form, description_en: e.target.value })}
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />

        <label style={labelStyle}>중문 설명</label>
        <textarea
          value={form.description_zh}
          onChange={(e) => setForm({ ...form, description_zh: e.target.value })}
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />

        <label style={labelStyle}>이모지 *</label>
        <input
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          maxLength={4}
          style={{ ...inputStyle, width: 90, fontSize: 20 }}
        />

        <label style={labelStyle}>위치 (지도에서 클릭해서 선택) *</label>
        <div
          style={{
            marginTop: 4,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #ddd",
          }}
        >
          <FacilityMap
            center={center}
            markerPosition={
              form.lat && form.lng
                ? [parseFloat(form.lat), parseFloat(form.lng)]
                : null
            }
            onMapClick={(lat, lng) =>
              setForm((prev) => ({
                ...prev,
                lat: lat.toFixed(7),
                lng: lng.toFixed(7),
              }))
            }
          />
        </div>

        {form.lat && form.lng && (
          <div style={{ fontSize: 12, color: "#2563EB", marginTop: 8 }}>
            선택된 위치: {form.lat}, {form.lng}
          </div>
        )}

        <label style={labelStyle}>사진</label>
        {form.photo_url && (
          <img
            src={form.photo_url}
            alt="명소 사진"
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "cover",
              borderRadius: 8,
              marginTop: 8,
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading || saving}
            onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
            style={{ flex: 1, fontSize: 12 }}
          />
          {pendingPhoto && !landmark && (
            <span style={{ fontSize: 12, color: "#2563EB" }}>
              저장 시 업로드: {pendingPhoto.name}
            </span>
          )}
          {form.photo_url && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              disabled={uploading || saving}
              style={{
                padding: "7px 10px",
                border: "1px solid #DC2626",
                borderRadius: 6,
                background: "#fff",
                color: "#DC2626",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              사진 삭제
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            style={{
              flex: 1,
              padding: "10px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
