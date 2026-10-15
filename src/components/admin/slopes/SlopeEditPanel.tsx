"use client";

import { useEffect, useId, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import SlopeEditToolbar from "@/components/admin/slopes/SlopeEditToolbar";
import SlopeSegmentList from "@/components/slope/SlopeSegmentList";
import type {
  SlopeEditDraft,
  SlopeEditorHandle,
} from "@/components/slope/types";
import { useSlopeRouteDraft } from "@/components/slope/useSlopeRouteDraft";
import { toStoredSegments } from "@/lib/slopeRoute";
import type { SlopeUnit } from "@/lib/slopeScale";
import { saveSlopeRoute } from "@/lib/slopeSave";
import {
  formatMeters,
  slopeDisplayName,
  verticesBounds,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { SlopeSegment } from "@/types/domain";

const UNIT_OPTIONS: { unit: SlopeUnit; symbol: string; label: string }[] = [
  { unit: "deg", symbol: "°", label: "도(°)" },
  { unit: "percent", symbol: "%", label: "퍼센트(%)" },
];

interface SlopeEditPanelProps {
  /** null이면 새 경로 */
  route: SlopeSegment | null;
  summary: SlopeRouteSummary | null;
  /** 형제인 편집 지도가 내놓은 손잡이. owner가 맞는 것만 페이지가 넘긴다 */
  editor: SlopeEditorHandle | null;
  onDraftChange: (draft: SlopeEditDraft) => void;
  /** 다시 받기와 보기 전환이 끝난 뒤 돌아온다 */
  onSaved: (routeId: string, created: boolean) => Promise<void>;
  onCancel: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function SlopeEditPanel({
  route,
  summary,
  editor,
  onDraftChange,
  onSaved,
  onCancel,
  showToast,
}: SlopeEditPanelProps) {
  const owner = route ? `edit:${route.id}` : "edit:new";
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const {
    name,
    setName,
    vertices,
    slopes,
    drafts,
    unit,
    segments,
    errors,
    dirty,
    handleVerticesChange,
    handleDraftChange,
    handleUnitChange,
  } = useSlopeRouteDraft({
    name: route?.name ?? "",
    vertices: summary?.vertices ?? null,
    slopes: summary?.segments.map((segment) => segment.slope) ?? [],
  });
  // 저장 조건은 패널을 연 때의 행 값이다. 그사이 목록을 다시 받아도 바꾸지 않는다(설계 2026-10-14 2.8)
  const [loadedAt] = useState(route?.updated_at ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  const fieldId = useId();
  useUnsavedChanges(dirty);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  // 지도(형제 컴포넌트)가 미리보기를 칠하고 꼭짓점 변경을 돌려주도록 맡긴다
  useEffect(() => {
    onDraftChangeRef.current({
      owner,
      slopes,
      locked: saving,
      bounds: verticesBounds(vertices),
      onVerticesChange: handleVerticesChange,
    });
  }, [owner, slopes, saving, vertices, handleVerticesChange]);

  const canSave = errors.length === 0;
  const total =
    Math.round(segments.reduce((sum, { distance }) => sum + distance, 0) * 10) /
    10;
  const status = !route
    ? { label: "새 경로", tone: "neutral" }
    : dirty
      ? { label: "저장 안 됨", tone: "warn" }
      : { label: "저장됨", tone: "ok" };

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const result = await saveSlopeRoute({
      routeId: route ? String(route.id) : null,
      loadedAt,
      name: name.trim(),
      segments: toStoredSegments(vertices, slopes as number[]),
    });
    if (!result.ok) {
      // 그린 경로와 입력값은 남긴다. 현장 실측값이라 날리면 다시 재야 한다
      setSaving(false);
      showToast(
        result.reason === "conflict"
          ? "다른 곳에서 바뀌었거나 삭제된 경로예요. 새로고침해서 확인해주세요"
          : `저장 실패: ${result.message}`,
        "error",
      );
      return;
    }
    await onSaved(result.routeId, result.created);
    setSaving(false);
    showToast(result.created ? "경로가 추가되었어요" : "경로가 수정되었어요");
  }

  function handleReset() {
    setConfirmReset(false);
    editor?.commands.reset();
  }

  const label = route ? `${slopeDisplayName(route)} 편집` : "새 경로";

  // 모바일 상세는 헤더를 그리지 않으므로(DetailPanel) 같은 줄을 본문 맨 위에 둔다
  const statusRow = (
    <div className="ku-slope-edit-status-row">
      <span
        className="ku-row-badge ku-slope-edit-status"
        data-tone={status.tone}
      >
        {status.label}
      </span>
      <span className="ku-slope-edit-meta">
        {segments.length}개 구간 · 총 {formatMeters(total)}
      </span>
      <div className="ku-detail-segment" role="group" aria-label="경사 단위">
        {UNIT_OPTIONS.map((option) => (
          <button
            key={option.unit}
            type="button"
            aria-label={option.label}
            aria-pressed={unit === option.unit}
            disabled={saving}
            onClick={() => handleUnitChange(option.unit)}
          >
            {option.symbol}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <DetailPanel
        label={label}
        header={statusRow}
        onClose={onCancel}
        closeDisabled={saving}
        closeLabel="취소"
        footNote="지도에서 꼭짓점을 끌어 경로를 고쳐요"
        save={{
          pending: saving,
          disabled: !canSave,
          onClick: () => void handleSave(),
        }}
      >
        {mobile && statusRow}
        <div className="ku-slope-edit-name">
          <label htmlFor={`${fieldId}-name`} className="ku-detail-label">
            경로 이름
          </label>
          <input
            id={`${fieldId}-name`}
            value={name}
            placeholder="예: 안암병원 정문 경사로"
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <SlopeSegmentList
          segments={segments}
          drafts={drafts}
          slopes={slopes}
          unit={unit}
          onDraftChange={handleDraftChange}
          disabled={saving}
        />
        {errors.length > 0 && vertices.length > 0 && (
          <ul className="ku-slope-edit-errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </DetailPanel>
      <SlopeEditToolbar
        editor={editor}
        locked={saving}
        onResetRequest={() => setConfirmReset(true)}
      />
      {/* 지도 자리는 z-index 0 맥락이라 지도 안에서 그리면 패널 밑에 갇힌다. 패널의 형제로 그린다 */}
      {confirmReset && (
        <ConfirmModal
          message="그린 경로를 지우고 다시 그릴까요?"
          description="그린 선과 입력한 경사도가 모두 사라집니다. 현장에서 잰 값이라 되돌릴 수 없어요."
          confirmLabel="지우고 다시 그리기"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}
