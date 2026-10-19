"use client";

import { useId, useState } from "react";
import SlopeBandsLegend from "@/components/map/SlopeBandsLegend";
import {
  SLOPE_UNIT_OPTIONS,
  readSlopeUnitPreference,
  writeSlopeUnitPreference,
} from "@/components/slope/useSlopeRouteDraft";
import { authedFetch } from "@/lib/authedFetch";
import { readErrorMessage } from "@/lib/responseError";
import {
  DEFAULT_SLOPE_BANDS,
  MAX_SLOPE_BANDS,
  MIN_SLOPE_BANDS,
  isHexColor,
  type SlopeBand,
} from "@/lib/slopeBands";
import {
  addBand,
  convertedUpper,
  draftFromBands,
  draftHasInputError,
  editUpper,
  redraftBandsForUnit,
  removeBand,
  validateBandsDraft,
  type SlopeBandDraftRow,
} from "@/lib/slopeBandsDraft";
import { setSlopeBands } from "@/lib/slopeBandsStore";
import type { SlopeUnit } from "@/lib/slopeScale";
import { useModalFocus } from "@/lib/useModalFocus";

const UNIT_SYMBOL: Record<SlopeUnit, string> = { deg: "°", percent: "%" };
const SAVE_FAILED = "범례를 저장하지 못했어요";

interface SlopeBandsModalProps {
  /** 저장소가 ready일 때의 값. 다른 상태에서는 페이지가 모달을 열지 않는다(설계 3장) */
  initialBands: readonly SlopeBand[];
  onClose: () => void;
  onSaved: () => void;
}

/** 자주 쓰지 않을 기능이라 동시 편집 검사·이력·닫을 때 확인을 두지 않는다(설계 6장) */
export default function SlopeBandsModal({
  initialBands,
  onClose,
  onSaved,
}: SlopeBandsModalProps) {
  const [unit, setUnit] = useState<SlopeUnit>(readSlopeUnitPreference);
  const [rows, setRows] = useState<SlopeBandDraftRow[]>(() =>
    draftFromBands(initialBands, unit),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    // 이 훅은 document 캡처 단계에서 Esc를 먼저 받아 모달을 닫는다. 툴팁이 열린 동안의 Esc는 툴팁만 닫게 끈다
    closeOnEscape: !saving && !tooltipOpen,
  });
  const validation = validateBandsDraft(rows);
  const inputError = draftHasInputError(rows);
  const canSave = validation.ok && !inputError && !saving;

  function updateRow(
    index: number,
    change: (row: SlopeBandDraftRow) => SlopeBandDraftRow,
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? change(row) : row)),
    );
  }

  function handleUnitChange(next: SlopeUnit) {
    setUnit(next);
    writeSlopeUnitPreference(next);
    setRows((current) => redraftBandsForUnit(current, next));
  }

  async function handleSave() {
    if (!validation.ok || inputError) return;
    const value = validation.value;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await authedFetch("/api/settings/slope-bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!response.ok) {
        setSaveError(await readErrorMessage(response, SAVE_FAILED));
        return;
      }
      setSlopeBands(value.bands);
      onSaved();
    } catch {
      setSaveError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="ku-bands-modal-backdrop"
      role="presentation"
      // click으로 받으면 안에서 끌다 밖에서 놓아도 초안째 닫힌다
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ku-bands-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>범례 편집</h2>

        <div className="ku-bands-modal-preview">
          {validation.ok ? (
            <SlopeBandsLegend
              bands={validation.value.bands}
              tooltipPlacement="below"
              onTooltipOpenChange={setTooltipOpen}
            />
          ) : (
            <p>입력을 고치면 미리보기가 다시 보여요</p>
          )}
        </div>

        <div className="ku-bands-modal-unit">
          <span>상한 단위</span>
          <div
            className="ku-detail-segment"
            role="group"
            aria-label="상한 단위"
          >
            {SLOPE_UNIT_OPTIONS.map((option) => (
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

        <ol className="ku-bands-modal-rows">
          {rows.map((row, index) => {
            const number = index + 1;
            const last = index === rows.length - 1;
            const converted = convertedUpper(row, unit);
            const errorId = `${titleId}-upper-${row.key}`;
            return (
              <li key={row.key} className="ku-bands-modal-row">
                <span className="ku-bands-modal-color">
                  <input
                    type="color"
                    aria-label={`구간 ${number} 색 고르기`}
                    value={
                      isHexColor(row.color)
                        ? row.color.toLowerCase()
                        : "#000000"
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateRow(index, (current) => ({
                        ...current,
                        color: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <input
                    type="text"
                    aria-label={`구간 ${number} 색`}
                    value={row.color}
                    spellCheck={false}
                    disabled={saving}
                    onChange={(event) =>
                      updateRow(index, (current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                  />
                </span>
                <input
                  className="ku-bands-modal-name"
                  type="text"
                  aria-label={`구간 ${number} 이름`}
                  value={row.name}
                  disabled={saving}
                  onChange={(event) =>
                    updateRow(index, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <span className="ku-bands-modal-upper">
                  {last ? (
                    <span>그 위 전부</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`구간 ${number} 상한`}
                        aria-invalid={row.upperError ? true : undefined}
                        aria-describedby={row.upperError ? errorId : undefined}
                        value={row.upperInput}
                        disabled={saving}
                        onChange={(event) =>
                          updateRow(index, (current) =>
                            editUpper(current, event.target.value, unit),
                          )
                        }
                      />
                      <span>{UNIT_SYMBOL[unit]}</span>
                      {converted && (
                        <span className="ku-bands-modal-converted">
                          = {converted}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <input
                  className="ku-bands-modal-description"
                  type="text"
                  aria-label={`구간 ${number} 설명`}
                  value={row.description}
                  disabled={saving}
                  onChange={(event) =>
                    updateRow(index, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="ku-bands-modal-remove"
                  aria-label={`구간 ${number} 삭제`}
                  disabled={saving || rows.length <= MIN_SLOPE_BANDS}
                  onClick={() =>
                    setRows((current) => removeBand(current, index))
                  }
                >
                  ✕
                </button>
                {row.upperError && (
                  <p id={errorId} className="ku-bands-modal-field-error">
                    {row.upperError}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="ku-bands-modal-tools">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving || rows.length >= MAX_SLOPE_BANDS}
            onClick={() => setRows(addBand)}
          >
            구간 추가
          </button>
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={() => setRows(draftFromBands(DEFAULT_SLOPE_BANDS, unit))}
          >
            기본값으로
          </button>
        </div>

        {!validation.ok && (
          <ul className="ku-bands-modal-errors">
            {validation.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="ku-bands-modal-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="ku-bands-modal-actions">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="ku-workspace-primary"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
