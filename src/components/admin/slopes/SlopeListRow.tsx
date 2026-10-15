import { SLOPE_GRADE_COLORS } from "@/lib/slopeScale";
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
        <span className="ku-row-badge" data-tone={badge.tone}>
          {badge.label}
        </span>
      </span>
      {/* 배지가 글자로 판정을 말하므로 막대는 읽지 않는다 */}
      {summary && (
        <span className="ku-slope-profile" aria-hidden="true">
          {summary.segments.map((segment) => (
            <span
              key={segment.index}
              style={{
                flex: segment.distance,
                background: SLOPE_GRADE_COLORS[segment.grade],
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
