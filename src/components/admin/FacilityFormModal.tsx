"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { validateFacilityForm } from "@/lib/facilityForm";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

interface FacilityFormModalProps {
  /** null이면 건물 비종속(독립) 시설 */
  buildingId: number | null;
  center: [number, number];
  facilityTypes: FacilityType[];
  /** null이면 신규 추가, 값이 있으면 해당 시설 편집 */
  facility: FacilityWithType | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityFormModal({
  buildingId,
  center,
  facilityTypes,
  facility,
  onClose,
  onSaved,
  showToast,
}: FacilityFormModalProps) {
  const standalone = buildingId === null;
  const editing = facility !== null;
  const [form, setForm] = useState({
    facility_code: facility?.facility_code ?? "",
    name: facility?.name ?? "",
    description: facility?.description ?? "",
    floor_info: facility?.floor_info ?? "",
    is_installed: facility?.is_installed ?? true,
    lat: facility?.lat != null ? String(facility.lat) : "",
    lng: facility?.lng != null ? String(facility.lng) : "",
  });
  const [saving, setSaving] = useState(false);

  /** 번역 컬럼을 현재 입력 기준으로 다시 채운다. 실패 시 기존 값을 유지한다. */
  async function syncTranslations(facilityId: string) {
    const texts: Record<string, string> = {};
    if (form.name) texts.name = form.name;
    if (form.description) texts.description = form.description;
    if (!standalone && form.floor_info) texts.floor_info = form.floor_info;

    const translated: {
      name_en: string | null;
      name_zh: string | null;
      description_en: string | null;
      description_zh: string | null;
      floor_info_en: string | null;
      floor_info_zh: string | null;
    } = {
      name_en: null,
      name_zh: null,
      description_en: null,
      description_zh: null,
      floor_info_en: null,
      floor_info_zh: null,
    };

    if (Object.keys(texts).length > 0) {
      try {
        const res = await authedFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts }),
        });
        if (!res.ok) throw new Error("translate failed");
        const { en, zh } = await res.json();
        translated.name_en = en.name ?? null;
        translated.name_zh = zh.name ?? null;
        translated.description_en = en.description ?? null;
        translated.description_zh = zh.description ?? null;
        translated.floor_info_en = en.floor_info ?? null;
        translated.floor_info_zh = zh.floor_info ?? null;
      } catch {
        // 번역 실패해도 시설 저장은 완료 — 기존 번역을 건드리지 않는다
        return;
      }
    }

    await supabase
      .from("building_facilities")
      .update(translated)
      .eq("id", facilityId);
  }

  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    setSaving(true);

    const payload = {
      building_id: buildingId,
      facility_code: form.facility_code,
      name: form.name || null,
      description: form.description || null,
      floor_info: standalone ? null : form.floor_info || null,
      is_installed: form.is_installed,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    };

    // 주의: `editing` 불리언으로는 facility가 non-null로 좁혀지지 않는다.
    // 반드시 facility 자체를 조건으로 써야 typecheck를 통과한다.
    let facilityId: string;
    if (facility) {
      const { error } = await supabase
        .from("building_facilities")
        .update(payload)
        .eq("id", facility.id);
      if (error) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = facility.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("building_facilities")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = inserted.id;
    }

    await syncTranslations(facilityId);

    setSaving(false);
    onSaved();
    showToast(editing ? "시설이 수정되었어요!" : "시설이 추가되었어요!");
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
          width: 500,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editing ? "시설 수정" : "시설 추가"}
        </div>

        <label style={labelStyle}>시설 유형 *</label>
        <select
          value={form.facility_code}
          onChange={(e) => setForm({ ...form, facility_code: e.target.value })}
          style={inputStyle}
        >
          <option value="">선택해주세요</option>
          {facilityTypes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>

        <label style={labelStyle}>시설 이름 (선택)</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="예: 정문 엘리베이터"
          style={inputStyle}
        />

        <label style={labelStyle}>설명 (선택)</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="예: 정문 우측 내부"
          style={inputStyle}
        />

        {!standalone && (
          <>
            <label style={labelStyle}>층 정보 (선택)</label>
            <input
              value={form.floor_info}
              onChange={(e) => setForm({ ...form, floor_info: e.target.value })}
              placeholder="예: 1층~4층"
              style={inputStyle}
            />
          </>
        )}

        <label style={labelStyle}>
          위치 (지도에서 클릭해서 선택){standalone ? " *" : ""}
        </label>
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
            highlightId={buildingId ?? undefined}
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

        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={form.is_installed}
            onChange={(e) =>
              setForm({ ...form, is_installed: e.target.checked })
            }
          />
          설치됨
        </label>

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
            disabled={saving}
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
