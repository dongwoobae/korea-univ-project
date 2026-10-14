import { LandmarkEmoji } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  landmarkDisplayName,
  landmarkNeedsTranslation,
} from "@/lib/landmarkWorkspace";
import type { Landmark } from "@/types/domain";

interface LandmarkListRowProps {
  landmark: Landmark;
  /** 경계를 받기 전에는 빈 값이다 */
  campus: string;
  selected: boolean;
  onSelect: () => void;
}

export default function LandmarkListRow({
  landmark,
  campus,
  selected,
  onSelect,
}: LandmarkListRowProps) {
  const date = formatAdminUpdatedAt(landmark.updated_at);
  return (
    <button
      type="button"
      className="ku-workspace-row"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="ku-workspace-row-icon ku-landmark-row-icon">
        <LandmarkEmoji icon={landmark.icon} size={17} />
      </span>
      <span className="ku-workspace-row-text">
        <span
          className="ku-workspace-row-name"
          data-testid="admin-list-item-name"
        >
          {landmarkDisplayName(landmark)}
        </span>
        <span className="ku-workspace-row-meta">
          {campus ? `${campus} · ${date}` : date}
        </span>
      </span>
      <span className="ku-workspace-row-badges">
        {!landmark.photo_url?.trim() && (
          <span className="ku-row-badge" data-tone="neutral">
            사진 없음
          </span>
        )}
        {landmarkNeedsTranslation(landmark) && (
          <span className="ku-row-badge" data-tone="warn">
            번역 없음
          </span>
        )}
      </span>
    </button>
  );
}
