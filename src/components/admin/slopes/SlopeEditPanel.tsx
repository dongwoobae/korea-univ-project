"use client";

import { useEffect, useId, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
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
  /** 기존 경로의 삭제. 모바일에서만 그린다 — 모바일은 보기와 편집을 합치고, 데스크톱은 보기 패널에 둔다 */
  remove?: DetailRemoveAction;
  /**
   * 모바일에서 상세를 접고 전체 지도에서 경로를 고치는 중인지 알린다. 패널이 닫힐 때는 고치던 중이 아니었어도
   * closed와 함께 false가 온다 — 전체 지도를 마친 것과 패널이 사라진 것을 페이지가 가른다
   */
  onFullMapChange: (open: boolean, closed?: boolean) => void;
  showToast: (message: string, type?: string) => void;
}

export default function SlopeEditPanel({
  route,
  summary,
  editor,
  onDraftChange,
  onSaved,
  onCancel,
  remove,
  onFullMapChange,
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
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  const onFullMapChangeRef = useRef(onFullMapChange);
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const mapBarRef = useRef<HTMLDivElement>(null);
  const mapReturnFocusRef = useRef(false);
  const fieldId = useId();
  // 지도를 가리지 않는 데스크톱에는 전체 지도가 없다. 전체 지도 중에 데스크톱 폭이 되면 상세를 다시 보인다
  const fullMap = mobile && fullMapOpen;
  useUnsavedChanges(dirty);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onFullMapChangeRef.current = onFullMapChange;
  }, [onDraftChange, onFullMapChange]);

  // 패널이 사라졌다고 알려 페이지가 전체 지도와 그 초점을 거두게 한다
  useEffect(() => () => onFullMapChangeRef.current(false, true), []);

  // 전체 지도 버튼과 확인 바는 서로 자리를 바꾼다. 사라진 쪽에 있던 초점은 body로 떨어지므로 나타난 쪽으로 옮긴다
  useEffect(() => {
    if (fullMap) {
      mapBarRef.current?.focus();
      return;
    }
    if (!mapReturnFocusRef.current) return;
    mapReturnFocusRef.current = false;
    mapButtonRef.current?.focus();
  }, [fullMap]);

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

  function openFullMap() {
    setFullMapOpen(true);
    onFullMapChange(true);
  }

  // 되돌리기는 두지 않는다. 지도 편집은 바로 초안에 들고, 패널의 취소가 초안 전체를 버린다
  function closeFullMap() {
    mapReturnFocusRef.current = true;
    setFullMapOpen(false);
    onFullMapChange(false);
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
        remove={mobile && remove ? { ...remove, disabled: saving } : undefined}
        save={{
          pending: saving,
          disabled: !canSave,
          onClick: () => void handleSave(),
        }}
        hidden={fullMap}
      >
        {mobile && statusRow}
        {/* 모바일 상세는 지도를 띠만 남기고 덮어 도구 바를 둘 자리가 없다. 도구 바는 전체 지도에서 쓴다 */}
        {mobile && (
          <button
            ref={mapButtonRef}
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={openFullMap}
          >
            {vertices.length > 0
              ? "지도에서 경로 고치기"
              : "지도에서 경로 그리기"}
          </button>
        )}
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
      {(!mobile || fullMap) && (
        <SlopeEditToolbar
          editor={editor}
          locked={saving}
          onResetRequest={() => setConfirmReset(true)}
        />
      )}
      {fullMap && (
        <div
          ref={mapBarRef}
          className="ku-slope-map-bar"
          role="region"
          aria-label="지도 편집"
          tabIndex={-1}
        >
          <p>도구 바로 그리고 꼭짓점을 끌어 고쳐요</p>
          {/* 그리는 중에 나가면 띠에는 그리기를 끝내거나 취소할 도구 바가 없다 */}
          <button
            type="button"
            className="ku-workspace-primary"
            disabled={editor?.state.drawing ?? false}
            onClick={closeFullMap}
          >
            완료
          </button>
        </div>
      )}
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
