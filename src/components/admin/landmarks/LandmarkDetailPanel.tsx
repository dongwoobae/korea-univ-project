"use client";

import DetailPanel from "@/components/admin/workspace/DetailPanel";
import { LandmarkEmoji } from "@/components/map/iconography";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  landmarkCampusLabel,
  landmarkDisplayName,
} from "@/lib/landmarkWorkspace";
import type { CampusBoundaryCollection } from "@/lib/campusGeometry";
import type { Landmark } from "@/types/domain";

interface LandmarkDetailPanelProps {
  /** null이면 새 명소 */
  landmark: Landmark | null;
  boundaries: CampusBoundaryCollection | null;
  onClose: () => void;
}

export default function LandmarkDetailPanel({
  landmark,
  boundaries,
  onClose,
}: LandmarkDetailPanelProps) {
  const label = landmark ? landmarkDisplayName(landmark) : "명소 추가";
  const campus = landmark ? landmarkCampusLabel(landmark, boundaries) : "";
  const date = landmark ? formatAdminUpdatedAt(landmark.updated_at) : "";
  return (
    <DetailPanel
      label={label}
      header={
        <div className="ku-detail-title">
          <span
            className="ku-detail-title-icon ku-landmark-row-icon"
            aria-hidden="true"
          >
            <LandmarkEmoji icon={landmark?.icon} size={22} />
          </span>
          <div>
            <h2>{label}</h2>
            <p>
              {landmark
                ? campus
                  ? `${campus} · ${date}`
                  : date
                : "지도를 눌러 위치를 찍어요"}
            </p>
          </div>
        </div>
      }
      onClose={onClose}
      save={null}
      mapStrip={false}
    >
      {landmark && (
        <p className="ku-detail-coords">
          {landmark.lat.toFixed(5)}, {landmark.lng.toFixed(5)}
        </p>
      )}
    </DetailPanel>
  );
}
