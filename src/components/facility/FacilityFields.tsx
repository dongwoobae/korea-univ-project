"use client";

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import dynamic from "next/dynamic";
import {
  FACILITY_FIELD_LIMITS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

export interface FacilityFieldLabels {
  type: string;
  typePlaceholder: string;
  name: string;
  namePlaceholder: string;
  description: string;
  descriptionPlaceholder: string;
  floor: string;
  floorPlaceholder: string;
  location: string;
  installed: string;
}

export const ADMIN_FACILITY_FIELD_LABELS: FacilityFieldLabels = {
  type: "시설 유형 *",
  typePlaceholder: "선택해주세요",
  name: "시설 이름 (선택)",
  namePlaceholder: "예: 정문 엘리베이터",
  description: "설명 (선택)",
  descriptionPlaceholder: "예: 정문 우측 내부",
  floor: "층 정보 (선택)",
  floorPlaceholder: "예: 1층~4층",
  location: "위치 (지도에서 클릭해서 선택)",
  installed: "설치됨",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: "var(--ku-radius)",
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

interface FacilityFieldsProps {
  idPrefix: string;
  value: FacilityFieldValues;
  onChange: Dispatch<SetStateAction<FacilityFieldValues>>;
  facilityTypes: { code: string; label: string }[];
  labels: FacilityFieldLabels;
  mapCenter: [number, number];
  highlightBuildingId?: number;
  /** 위치 지도의 건물 강조색. 비우면 FacilityMap의 기본값 */
  highlightColor?: string;
  showFloor: boolean;
  showInstalled: boolean;
  locationRequired?: boolean;
  /** false면 위치 칸(라벨·지도·footer)을 그리지 않는다. 큰 지도에서 위치를 고르는 화면이 쓴다 */
  showLocation?: boolean;
  /** 지도 아래에 붙는 내용 */
  locationFooter?: ReactNode;
  disabled?: boolean;
}

export default function FacilityFields({
  idPrefix,
  value,
  onChange,
  facilityTypes,
  labels,
  mapCenter,
  highlightBuildingId,
  highlightColor,
  showFloor,
  showInstalled,
  locationRequired = false,
  showLocation = true,
  locationFooter,
  disabled = false,
}: FacilityFieldsProps) {
  const set = (patch: Partial<FacilityFieldValues>) =>
    onChange((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <label style={labelStyle} htmlFor={`${idPrefix}-code`}>
        {labels.type}
      </label>
      <select
        id={`${idPrefix}-code`}
        value={value.facility_code}
        onChange={(e) => set({ facility_code: e.target.value })}
        disabled={disabled}
        style={inputStyle}
      >
        <option value="">{labels.typePlaceholder}</option>
        {facilityTypes.map((type) => (
          <option key={type.code} value={type.code}>
            {type.label}
          </option>
        ))}
      </select>

      <label style={labelStyle} htmlFor={`${idPrefix}-name`}>
        {labels.name}
      </label>
      <input
        id={`${idPrefix}-name`}
        value={value.name}
        maxLength={FACILITY_FIELD_LIMITS.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder={labels.namePlaceholder}
        disabled={disabled}
        style={inputStyle}
      />

      <label style={labelStyle} htmlFor={`${idPrefix}-description`}>
        {labels.description}
      </label>
      <input
        id={`${idPrefix}-description`}
        value={value.description}
        maxLength={FACILITY_FIELD_LIMITS.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder={labels.descriptionPlaceholder}
        disabled={disabled}
        style={inputStyle}
      />

      {showFloor && (
        <>
          <label style={labelStyle} htmlFor={`${idPrefix}-floor`}>
            {labels.floor}
          </label>
          <input
            id={`${idPrefix}-floor`}
            value={value.floor_info}
            maxLength={FACILITY_FIELD_LIMITS.floor_info}
            onChange={(e) => set({ floor_info: e.target.value })}
            placeholder={labels.floorPlaceholder}
            disabled={disabled}
            style={inputStyle}
          />
        </>
      )}

      {showLocation && (
        <>
          <div className="ku-facility-location-label" style={labelStyle}>
            {labels.location}
            {locationRequired ? " *" : ""}
          </div>
          <div
            className="ku-facility-map-frame"
            style={{
              marginTop: 4,
              borderRadius: "var(--ku-radius)",
              overflow: "hidden",
              border: "1px solid #ddd",
            }}
          >
            <FacilityMap
              center={mapCenter}
              highlightId={highlightBuildingId}
              highlightColor={highlightColor}
              markerPosition={
                value.lat && value.lng
                  ? [parseFloat(value.lat), parseFloat(value.lng)]
                  : null
              }
              onMapClick={(lat, lng) => {
                if (!disabled)
                  set({ lat: lat.toFixed(7), lng: lng.toFixed(7) });
              }}
            />
          </div>
          {locationFooter}
        </>
      )}

      {showInstalled && (
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
            checked={value.is_installed}
            onChange={(e) => set({ is_installed: e.target.checked })}
            disabled={disabled}
          />
          {labels.installed}
        </label>
      )}
    </>
  );
}
