"use client";

import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  SLOPE_GRADE_COLORS,
  SLOPE_GRADE_LABELS,
  degToPercent,
  formatDeg,
  formatPercent,
  type SlopeGrade,
} from "@/lib/slopeScale";
import {
  formatMeters,
  slopeDisplayName,
  type SlopeListItem,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";
import { useMediaQuery } from "@/lib/useMediaQuery";

/** 행 배지(slopeRouteBadge)와 같은 색 짝을 구간 하나에 쓴다 */
const GRADE_TONES: Record<SlopeGrade, "ok" | "warn" | "missing"> = {
  ok: "ok",
  over: "warn",
  extreme: "missing",
};

function SegmentTable({ summary }: { summary: SlopeRouteSummary }) {
  return (
    <table className="ku-slope-table">
      <thead>
        <tr>
          <th scope="col">구간</th>
          <th scope="col">거리</th>
          <th scope="col">경사</th>
          <th scope="col">판정</th>
        </tr>
      </thead>
      <tbody>
        {summary.segments.map((segment) => (
          <tr key={segment.index}>
            <td>
              <span className="ku-slope-table-index">
                <span
                  aria-hidden="true"
                  style={{ background: SLOPE_GRADE_COLORS[segment.grade] }}
                />
                {segment.index + 1}
              </span>
            </td>
            <td>{formatMeters(segment.distance)}</td>
            <td>
              {formatDeg(segment.slope)} ·{" "}
              {formatPercent(degToPercent(segment.slope))}
            </td>
            <td>
              <span
                className="ku-row-badge"
                data-tone={GRADE_TONES[segment.grade]}
              >
                {SLOPE_GRADE_LABELS[segment.grade]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface SlopeViewPanelProps {
  item: SlopeListItem;
  onEdit: () => void;
  onClose: () => void;
  remove?: DetailRemoveAction;
}

export default function SlopeViewPanel({
  item,
  onEdit,
  onClose,
  remove,
}: SlopeViewPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { route, summary } = item;
  const name = slopeDisplayName(route);
  const date = formatAdminUpdatedAt(route.updated_at);
  const meta = summary
    ? `${summary.segments.length}개 구간 · 총 ${formatMeters(summary.totalDistance)} · ${date}`
    : date;

  // 형식 오류 경로는 편집기가 읽지 못한다. 지우고 다시 그리게 한다(설계 2026-10-14 6.2)
  const editButton = summary && (
    <button type="button" className="ku-workspace-primary" onClick={onEdit}>
      경로 편집
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
      {/* 모바일 상세는 헤더를 그리지 않으므로(DetailPanel) 메타와 편집 진입을 본문 맨 위에 둔다 */}
      {mobile && (
        <div className="ku-slope-view-mobile-head">
          <p>{meta}</p>
          {editButton}
        </div>
      )}
      {summary ? (
        <SegmentTable summary={summary} />
      ) : (
        <p className="ku-slope-view-notice">
          저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요
        </p>
      )}
    </DetailPanel>
  );
}
