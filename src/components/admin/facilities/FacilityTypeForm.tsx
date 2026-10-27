"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FACILITY_ICON } from "@/components/map/iconography";
import {
  FACILITY_COLOR_CHOICES,
  FACILITY_ICON_CHOICES,
} from "@/lib/facilityStyleCatalog";
import {
  TYPE_LABEL_MAX,
  TYPE_TRANSLATION_MAX,
  fillEmptyTranslations,
  translateTypeLabel,
  typeFormError,
  typeFormFrom,
  typePayload,
  type FacilityTypeFormValues,
  type FacilityTypePayload,
} from "@/lib/facilityTypeAdmin";
import type { FacilityType } from "@/types/domain";

interface FacilityTypeFormProps {
  editing: FacilityType | null;
  types: readonly FacilityType[];
  saving: boolean;
  /** 종류 목록 받기가 실패해 낡은 목록으로 이름 겹침을 검사하게 될 때 저장을 막는다(설계 3.2) */
  locked: boolean;
  onBack: () => void;
  onSubmit: (payload: FacilityTypePayload) => void;
  showToast: (message: string, type?: string) => void;
}

/** 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.3 */
export default function FacilityTypeForm({
  editing,
  types,
  saving,
  locked,
  onBack,
  onSubmit,
  showToast,
}: FacilityTypeFormProps) {
  const [form, setForm] = useState<FacilityTypeFormValues>(() =>
    typeFormFrom(editing),
  );
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const id = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const PreviewIcon = FACILITY_ICON[form.icon];
  const iconName = FACILITY_ICON_CHOICES.find(
    (choice) => choice.key === form.icon,
  )?.label;
  const colorName =
    FACILITY_COLOR_CHOICES.find((choice) => choice.hex === form.color)?.label ??
    form.color;

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  function update(change: Partial<FacilityTypeFormValues>) {
    setForm((current) => ({ ...current, ...change }));
  }

  async function handleTranslate() {
    const label = form.label.trim();
    if (!label) return;
    setTranslating(true);
    const translated = await translateTypeLabel(label);
    setTranslating(false);
    if (!translated) {
      showToast(
        "자동번역에 실패했어요. 영어·중국어 이름을 직접 적어 주세요",
        "warning",
      );
      return;
    }
    setForm((current) => fillEmptyTranslations(current, translated));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || locked) return;
    const problem = typeFormError(form, types, editing?.code ?? null);
    setError(problem);
    if (problem) return;
    onSubmit(typePayload(form));
  }

  return (
    <form className="ku-types-form" onSubmit={handleSubmit} noValidate>
      <h3>
        {editing ? `종류 수정 — ${editing.label ?? editing.code}` : "종류 추가"}
      </h3>
      <div className="ku-types-form-names">
        <label htmlFor={`${id}-label`}>한국어 이름(필수)</label>
        <input
          id={`${id}-label`}
          ref={labelRef}
          type="text"
          value={form.label}
          maxLength={TYPE_LABEL_MAX}
          // 번역을 기다리는 사이 이름을 바꾸면 옛 이름의 번역이 빈 칸에 들어간다
          readOnly={translating}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => update({ label: event.target.value })}
        />
        <label htmlFor={`${id}-en`}>영어 이름</label>
        <input
          id={`${id}-en`}
          type="text"
          value={form.label_en}
          maxLength={TYPE_TRANSLATION_MAX}
          onChange={(event) => update({ label_en: event.target.value })}
        />
        <label htmlFor={`${id}-zh`}>중국어 이름</label>
        <input
          id={`${id}-zh`}
          type="text"
          value={form.label_zh}
          maxLength={TYPE_TRANSLATION_MAX}
          onChange={(event) => update({ label_zh: event.target.value })}
        />
        <div className="ku-types-form-translate">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={translating || saving || !form.label.trim()}
            onClick={() => void handleTranslate()}
          >
            {translating ? "번역 중..." : "자동번역 채우기"}
          </button>
          <span>비어 있는 칸만 채워요. 비워 두면 한국어 이름이 보여요.</span>
        </div>
      </div>

      <fieldset>
        <legend>아이콘</legend>
        <div className="ku-types-form-icon-grid">
          {FACILITY_ICON_CHOICES.map((choice) => {
            const Icon = FACILITY_ICON[choice.key];
            return (
              <label
                key={choice.key}
                className="ku-types-form-icon"
                title={choice.label}
              >
                <input
                  type="radio"
                  name={`${id}-icon`}
                  className="ku-sr-only"
                  checked={form.icon === choice.key}
                  onChange={() => update({ icon: choice.key })}
                />
                <Icon size={20} aria-hidden="true" />
                <span className="ku-sr-only">{choice.label}</span>
              </label>
            );
          })}
        </div>
        <p className="ku-types-form-picked">고른 아이콘: {iconName}</p>
      </fieldset>

      <fieldset>
        <legend>색</legend>
        <div className="ku-types-form-colors">
          {FACILITY_COLOR_CHOICES.map((choice) => (
            <label
              key={choice.hex}
              className="ku-types-form-color"
              title={choice.label}
            >
              <input
                type="radio"
                name={`${id}-color`}
                className="ku-sr-only"
                checked={form.color === choice.hex}
                onChange={() => update({ color: choice.hex })}
              />
              <span aria-hidden="true" style={{ background: choice.hex }} />
              <span className="ku-sr-only">{choice.label}</span>
            </label>
          ))}
        </div>
        <p className="ku-types-form-picked">고른 색: {colorName}</p>
      </fieldset>

      <div className="ku-types-form-preview" role="group" aria-label="미리보기">
        <span
          className="ku-types-form-preview-marker"
          style={{ background: form.color }}
        >
          <span>
            <PreviewIcon size={17} aria-hidden="true" />
          </span>
        </span>
        <span
          className="ku-types-form-preview-chip"
          style={{ background: form.color, borderColor: form.color }}
        >
          <PreviewIcon size={15} aria-hidden="true" />
          {form.label.trim() || "이름"}
        </span>
      </div>

      {error && (
        <p id={`${id}-error`} className="ku-types-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="ku-types-form-actions">
        <button
          type="button"
          className="ku-workspace-button"
          disabled={saving}
          onClick={onBack}
        >
          뒤로
        </button>
        <button
          type="submit"
          className="ku-workspace-primary"
          disabled={saving || locked}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
