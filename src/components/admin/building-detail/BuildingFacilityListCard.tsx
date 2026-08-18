"use client";

import type { RefObject } from "react";
import AddFacilityButton from "@/components/admin/AddFacilityButton";
import BulkRetranslateButton from "@/components/admin/BulkRetranslateButton";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { getFacilityBadges } from "@/lib/facilityBadges";
import type { FacilityBadge } from "@/lib/facilityBadges";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FACILITY_BADGE_LABELS: Record<FacilityBadge, string> = {
  missing: "미설치",
  translation_needed: "번역 필요",
};

const FACILITY_BADGE_CLASSES: Record<FacilityBadge, string> = {
  missing: "ku-facility-row-badge--missing",
  translation_needed: "ku-facility-row-badge--translation",
};

export default function BuildingFacilityListCard({
  buildingId,
  buildingCenter,
  facilities,
  facilityTypes,
  addFacilityRef,
  onChanged,
  onSelectFacility,
  showToast,
}: {
  buildingId: number;
  buildingCenter: [number, number];
  facilities: FacilityWithType[];
  facilityTypes: FacilityType[];
  addFacilityRef: RefObject<HTMLButtonElement | null>;
  onChanged: () => void | Promise<void>;
  onSelectFacility: (facilityId: string) => void;
  showToast: (message: string, type?: string) => void;
}) {
  return (
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
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>시설 현황</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <BulkRetranslateButton
            facilities={facilities}
            onDone={onChanged}
            showToast={showToast}
          />
          <AddFacilityButton
            buildingId={buildingId}
            center={buildingCenter}
            facilityTypes={facilityTypes}
            onAdd={onChanged}
            showToast={showToast}
            buttonRef={addFacilityRef}
          />
        </div>
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
          <button
            key={f.id}
            type="button"
            className="ku-facility-row"
            onClick={() => onSelectFacility(f.id)}
          >
            <span className="ku-facility-row-icon">
              <FacilityTypeIcon code={f.facility_types?.code} size={18} />
            </span>
            <span className="ku-facility-row-body">
              <span className="ku-facility-row-name">
                {f.name ?? f.facility_types?.label}
              </span>
              <span className="ku-facility-row-desc">
                {f.description}
                {f.floor_info && ` · ${f.floor_info}`}
              </span>
            </span>
            <span className="ku-facility-row-badges">
              {getFacilityBadges(f).map((badge) => (
                <span
                  key={badge}
                  className={`ku-facility-row-badge ${FACILITY_BADGE_CLASSES[badge]}`}
                >
                  {FACILITY_BADGE_LABELS[badge]}
                </span>
              ))}
            </span>
            <span className="ku-facility-row-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))
      )}
    </div>
  );
}
