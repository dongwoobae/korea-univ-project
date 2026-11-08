"use client";

import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import {
  formatMeters,
  formatSlopeListMeta,
  slopeDisplayName,
  type StairsListItem,
} from "@/lib/slopeWorkspace";
import { useMediaQuery } from "@/lib/useMediaQuery";

interface StairsViewPanelProps {
  item: StairsListItem;
  onEdit: () => void;
  onClose: () => void;
  remove?: DetailRemoveAction;
}

export default function StairsViewPanel({
  item,
  onEdit,
  onClose,
  remove,
}: StairsViewPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { route, summary } = item;
  const name = slopeDisplayName(route);
  const meta = formatSlopeListMeta(item);
  const editButton = summary && (
    <button type="button" className="ku-workspace-primary" onClick={onEdit}>
      계단 편집
    </button>
  );

  return (
    <DetailPanel
      label={name}
      header={
        <div className="ku-detail-title ku-slope-view-title">
          <div>
            <h2>{name}</h2>
            <p>{meta}</p>
          </div>
          {editButton}
        </div>
      }
      onClose={onClose}
      remove={remove}
      save={null}
    >
      {mobile && (
        <div className="ku-slope-view-mobile-head">
          <p>{meta}</p>
          {editButton}
        </div>
      )}
      {summary ? (
        <dl className="ku-stairs-facts">
          <dt>출처</dt>
          <dd>
            {route.osm_way_id === null
              ? "직접 그림"
              : `OSM ${route.osm_way_id}`}
          </dd>
          <dt>길이</dt>
          <dd>{formatMeters(summary.length)}</dd>
          <dt>설명</dt>
          <dd>{route.note?.trim() || "없음"}</dd>
        </dl>
      ) : (
        <p className="ku-slope-view-notice">
          저장 형식이 깨진 계단이라 열 수 없어요. 지우고 다시 그려주세요
        </p>
      )}
    </DetailPanel>
  );
}
