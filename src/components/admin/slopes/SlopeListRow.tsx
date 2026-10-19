"use client";

import { slopeBandFromDeg } from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import {
  formatSlopeRouteMeta,
  slopeDisplayName,
  slopeRouteBadge,
  type SlopeListItem,
} from "@/lib/slopeWorkspace";

interface SlopeListRowProps {
  item: SlopeListItem;
  selected: boolean;
  onSelect: () => void;
}

export default function SlopeListRow({
  item,
  selected,
  onSelect,
}: SlopeListRowProps) {
  const { bands } = useSlopeBands();
  const { route, summary } = item;
  const badge = slopeRouteBadge(summary);
  return (
    <button
      type="button"
      className="ku-workspace-row ku-slope-row"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="ku-slope-row-head">
        <span
          className="ku-workspace-row-name"
          data-testid="admin-list-item-name"
        >
          {slopeDisplayName(route)}
        </span>
        {badge && (
          <span className="ku-row-badge" data-tone={badge.tone}>
            {badge.label}
          </span>
        )}
      </span>
      {/* 색 막대는 읽지 않는다. 구간별 경사는 보기 패널의 구간 표가 글자로 말한다 */}
      {summary && (
        <span className="ku-slope-profile" aria-hidden="true">
          {summary.segments.map((segment) => (
            <span
              key={segment.index}
              style={{
                flex: segment.distance,
                background: slopeBandFromDeg(bands, segment.slope).color,
              }}
            />
          ))}
        </span>
      )}
      <span className="ku-workspace-row-meta">
        {formatSlopeRouteMeta(summary, route.updated_at)}
      </span>
    </button>
  );
}
