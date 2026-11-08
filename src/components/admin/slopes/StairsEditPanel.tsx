"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import SlopeEditToolbar from "@/components/admin/slopes/SlopeEditToolbar";
import type {
  SlopeEditorHandle,
  StairsEditDraft,
} from "@/components/slope/types";
import { useStairsDraft } from "@/components/slope/useStairsDraft";
import type { Vertex } from "@/lib/slopeRoute";
import { saveStairs } from "@/lib/slopeSave";
import {
  formatMeters,
  slopeDisplayName,
  verticesBounds,
} from "@/lib/slopeWorkspace";
import {
  applyStairsJoins,
  polylineLength,
  suggestStairsJoins,
  validateStairs,
  type RouteEndpoint,
  type StairsEnd,
} from "@/lib/stairs";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { SlopeSegment, StairsPoints } from "@/types/domain";

interface StairsEditPanelProps {
  /** 초안의 owner. 페이지가 만든다 */
  owner: string;
  /** null이면 새 계단 */
  route: SlopeSegment | null;
  /** 기존 계단의 저장된 모양, OSM 후보의 모양. 손으로 그리는 새 계단은 null */
  initialVertices: Vertex[] | null;
  /** OSM 후보로 여는 새 계단 */
  candidate: { osmWayId: number; name: string | null } | null;
  /** 끝 잇기 대상(경사로 끝점). 페이지가 목록이 바뀔 때만 새로 만든다 — 렌더마다 새 배열이면 초안을 끝없이 다시 내놓는다 */
  endpoints: RouteEndpoint[];
  editor: SlopeEditorHandle | null;
  onDraftChange: (draft: StairsEditDraft | null) => void;
  onSaved: (routeId: string, created: boolean) => Promise<void>;
  /** 이미 확정된 OSM 계단이었다. 페이지가 패널을 닫고 목록을 다시 받는다 */
  onDuplicate: () => Promise<void>;
  onCancel: () => void;
  remove?: DetailRemoveAction;
  onFullMapChange: (open: boolean, closed?: boolean) => void;
  showToast: (message: string, type?: string) => void;
}

export default function StairsEditPanel({
  owner,
  route,
  initialVertices,
  candidate,
  endpoints,
  editor,
  onDraftChange,
  onSaved,
  onDuplicate,
  onCancel,
  remove,
  onFullMapChange,
  showToast,
}: StairsEditPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const isNew = route === null;
  const {
    name,
    setName,
    note,
    setNote,
    vertices,
    handleVerticesChange,
    dirty: fieldsDirty,
  } = useStairsDraft({
    name: route?.name ?? (candidate ? (candidate.name ?? "계단") : ""),
    note: route?.note ?? "",
    vertices: initialVertices,
  });
  // 기존 계단은 잇지 않은 끝을 관리자가 일부러 둔 것일 수 있어 꺼진 채 연다
  const [joinEnabled, setJoinEnabled] = useState<Record<StairsEnd, boolean>>(
    () => ({ start: isNew, end: isNew }),
  );
  const joins = useMemo(
    () => suggestStairsJoins(vertices, endpoints),
    [vertices, endpoints],
  );
  const stored = useMemo(
    () => applyStairsJoins(vertices, joins, joinEnabled),
    [vertices, joins, joinEnabled],
  );
  // 저장할 좌표로 검사한다. 이어 붙인 끝이 다른 끝과 같은 점이면 길이 0 구간이 된다
  const errors = validateStairs(name, stored);
  const dirty =
    fieldsDirty || joins.some((join) => joinEnabled[join.end] !== isNew);
  const osmWayId = route ? route.osm_way_id : (candidate?.osmWayId ?? null);
  // 저장 조건은 패널을 연 때의 행 값이다(설계 2026-10-14 2.8)
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
  const fullMap = mobile && fullMapOpen;
  useUnsavedChanges(dirty);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onFullMapChangeRef.current = onFullMapChange;
  }, [onDraftChange, onFullMapChange]);

  // 사라지면 초안을 거둔다 — SlopeEditPanel과 같은 이유
  useEffect(() => {
    const publish = onDraftChangeRef;
    return () => publish.current(null);
  }, []);

  useEffect(() => () => onFullMapChangeRef.current(false, true), []);

  useEffect(() => {
    if (fullMap) {
      mapBarRef.current?.focus();
      return;
    }
    if (!mapReturnFocusRef.current) return;
    mapReturnFocusRef.current = false;
    mapButtonRef.current?.focus();
  }, [fullMap]);

  useEffect(() => {
    if (!mobile || fullMap || editor?.state.mode !== "drag") return;
    editor.commands.setMode("vertex");
  }, [mobile, fullMap, editor]);

  useEffect(() => {
    onDraftChangeRef.current({
      owner,
      kind: "stairs",
      preview: stored,
      locked: saving,
      bounds: verticesBounds(stored),
      onVerticesChange: handleVerticesChange,
    });
  }, [owner, stored, saving, handleVerticesChange]);

  const canSave = errors.length === 0;
  const status = isNew
    ? { label: candidate ? "OSM 후보" : "새 계단", tone: "neutral" }
    : dirty
      ? { label: "저장 안 됨", tone: "warn" }
      : { label: "저장됨", tone: "ok" };

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const result = await saveStairs({
      routeId: route ? String(route.id) : null,
      loadedAt,
      name: name.trim(),
      note: note.trim() || null,
      osmWayId,
      points: stored as StairsPoints,
    });
    if (!result.ok) {
      setSaving(false);
      if (result.reason === "duplicate") {
        showToast("이미 확정된 계단이에요", "error");
        await onDuplicate();
        return;
      }
      showToast(
        result.reason === "conflict"
          ? "다른 곳에서 바뀌었거나 삭제된 계단이에요. 새로고침해서 확인해주세요"
          : `저장 실패: ${result.message}`,
        "error",
      );
      return;
    }
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    showToast(result.created ? "계단을 추가했어요" : "계단을 수정했어요");
    await onSaved(result.routeId, result.created);
    setSaving(false);
  }

  function openFullMap() {
    setFullMapOpen(true);
    onFullMapChange(true);
  }

  function closeFullMap() {
    mapReturnFocusRef.current = true;
    setFullMapOpen(false);
    onFullMapChange(false);
  }

  const label = route
    ? `${slopeDisplayName(route)} 편집`
    : candidate
      ? "OSM 계단 확정"
      : "새 계단";

  const statusRow = (
    <div className="ku-slope-edit-status-row">
      <span
        className="ku-row-badge ku-slope-edit-status"
        data-tone={status.tone}
      >
        {status.label}
      </span>
      <span className="ku-slope-edit-meta">
        계단 · 총 {formatMeters(polylineLength(stored))}
      </span>
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
        footNote="지도에서 꼭짓점을 끌어 계단을 고쳐요"
        remove={mobile && remove ? { ...remove, disabled: saving } : undefined}
        save={{
          pending: saving,
          disabled: !canSave,
          label: isNew && candidate ? "계단으로 확정" : undefined,
          onClick: () => void handleSave(),
        }}
        hidden={fullMap}
      >
        {mobile && statusRow}
        {mobile && (
          <button
            ref={mapButtonRef}
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={openFullMap}
          >
            {vertices.length > 0
              ? "지도에서 계단 고치기"
              : "지도에서 계단 그리기"}
          </button>
        )}
        <div className="ku-slope-edit-name">
          <label htmlFor={`${fieldId}-name`} className="ku-detail-label">
            계단 이름
          </label>
          <input
            id={`${fieldId}-name`}
            value={name}
            placeholder="예: 중앙광장 계단"
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="ku-slope-edit-name">
          <label htmlFor={`${fieldId}-note`} className="ku-detail-label">
            설명 (선택)
          </label>
          <textarea
            id={`${fieldId}-note`}
            value={note}
            rows={2}
            placeholder="예: 우회: 본관 엘리베이터"
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {joins.length > 0 && (
          <fieldset className="ku-stairs-joins">
            <legend className="ku-detail-label">끝 잇기</legend>
            {joins.map((join) => (
              <label key={join.end}>
                <input
                  type="checkbox"
                  checked={joinEnabled[join.end]}
                  disabled={saving}
                  onChange={(event) =>
                    setJoinEnabled((current) => ({
                      ...current,
                      [join.end]: event.target.checked,
                    }))
                  }
                />
                {`${join.endpoint.routeName} 끝에 잇기 (${formatMeters(join.distance)})`}
              </label>
            ))}
          </fieldset>
        )}
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
      {confirmReset && (
        <ConfirmModal
          message="그린 계단을 지우고 다시 그릴까요?"
          description="그린 선이 사라집니다."
          confirmLabel="지우고 다시 그리기"
          onConfirm={() => {
            setConfirmReset(false);
            editor?.commands.reset();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}
