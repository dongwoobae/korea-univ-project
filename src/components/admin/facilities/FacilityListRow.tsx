import { getFacilityMarkerColor } from "@/components/map/facilityColors";
import { FacilityTypeIcon } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import { facilityDisplayName } from "@/lib/facilityWorkspace";
import type { FacilityWithType } from "@/types/domain";

interface FacilityListRowProps {
  facility: FacilityWithType;
  selected: boolean;
  onSelect: () => void;
}

export default function FacilityListRow({
  facility,
  selected,
  onSelect,
}: FacilityListRowProps) {
  const code = facility.facility_types?.code ?? facility.facility_code;
  return (
    <button
      type="button"
      className="ku-workspace-row"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span
        className="ku-workspace-row-icon"
        style={{ background: getFacilityMarkerColor(code ?? "") }}
      >
        <FacilityTypeIcon code={code} size={16} />
      </span>
      <span className="ku-workspace-row-text">
        <span
          className="ku-workspace-row-name"
          data-testid="admin-list-item-name"
        >
          {facilityDisplayName(facility)}
        </span>
        <span className="ku-workspace-row-meta">
          {facility.facility_types?.label ?? "유형 없음"} ·{" "}
          {formatAdminUpdatedAt(facility.updated_at)}
        </span>
      </span>
      <span className="ku-workspace-row-badges">
        {facility.is_installed === false && (
          <span className="ku-row-badge" data-tone="missing">
            미설치
          </span>
        )}
        {facilityNeedsTranslation(facility) && (
          <span className="ku-row-badge" data-tone="warn">
            번역 필요
          </span>
        )}
      </span>
    </button>
  );
}
