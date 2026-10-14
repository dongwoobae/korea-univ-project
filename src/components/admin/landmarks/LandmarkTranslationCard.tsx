"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";
import {
  applyLandmarkTranslations,
  requestLandmarkTranslations,
} from "@/lib/landmarkSave";
import {
  landmarkFormFromRow,
  type LandmarkFormValues,
} from "@/lib/landmarkWorkspace";
import type { Landmark } from "@/types/domain";

const TRANSLATION_FIELDS = [
  "name_en",
  "name_zh",
  "description_en",
  "description_zh",
] as const;

interface LandmarkTranslationCardProps {
  form: LandmarkFormValues;
  setForm: Dispatch<SetStateAction<LandmarkFormValues>>;
  /** null이면 새 명소 */
  landmark: Landmark | null;
  /** 저장 중에는 채우기와 입력을 막는다 */
  disabled: boolean;
  showToast: (message: string, type?: string) => void;
}

function Value({ text }: { text: string }) {
  return text.trim() ? (
    <span className="ku-landmark-translation-text">{text}</span>
  ) : (
    <span className="ku-landmark-translation-empty">번역 없음</span>
  );
}

export default function LandmarkTranslationCard({
  form,
  setForm,
  landmark,
  disabled,
  showToast,
}: LandmarkTranslationCardProps) {
  const [editing, setEditing] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const base = landmarkFormFromRow(landmark);
  const dirty = TRANSLATION_FIELDS.some(
    (field) => form[field].trim() !== base[field].trim(),
  );
  // 고친 값이 있는데 접으면 저장 안 한 변경이 눈에 안 띈다
  const expanded = editing || dirty;

  async function fill() {
    setPending(true);
    const result = await requestLandmarkTranslations(form);
    setPending(false);
    if (result.status === "failed") {
      showToast("자동번역에 실패했어요", "warning");
      return;
    }
    if (result.status === "empty") return;
    // 요청이 도는 사이 입력한 값을 덮지 않도록 지금 폼에 적용한다
    setForm((previous) => applyLandmarkTranslations(previous, result));
  }

  return (
    <section className="ku-landmark-translation" aria-label="번역">
      <div className="ku-landmark-translation-head">
        <h3>번역</h3>
        <button
          type="button"
          className="ku-landmark-translation-fill"
          onClick={() => void fill()}
          disabled={pending || disabled}
        >
          {pending ? "번역 중..." : "자동번역 채우기"}
        </button>
      </div>

      <dl className="ku-landmark-translation-rows">
        <div>
          <dt>English</dt>
          <dd>
            <Value text={form.name_en} />
          </dd>
        </div>
        <div>
          <dt>中文</dt>
          <dd>
            <Value text={form.name_zh} />
          </dd>
        </div>
        {showDescriptions && (
          <>
            <div>
              <dt>English 설명</dt>
              <dd>
                <Value text={form.description_en} />
              </dd>
            </div>
            <div>
              <dt>中文 설명</dt>
              <dd>
                <Value text={form.description_zh} />
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="ku-landmark-translation-actions">
        <button
          type="button"
          aria-expanded={showDescriptions}
          onClick={() => setShowDescriptions((open) => !open)}
        >
          {showDescriptions ? "설명 접기" : "설명 보기"}
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            if (!dirty) setEditing((open) => !open);
          }}
        >
          직접 고치기
        </button>
      </div>

      {expanded && (
        <div className="ku-detail-form ku-landmark-translation-form">
          <label htmlFor={`${fieldId}-name-en`}>영문 이름</label>
          <input
            id={`${fieldId}-name-en`}
            value={form.name_en}
            disabled={disabled}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                name_en: event.target.value,
              }))
            }
          />
          <label htmlFor={`${fieldId}-name-zh`}>중문 이름</label>
          <input
            id={`${fieldId}-name-zh`}
            value={form.name_zh}
            disabled={disabled}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                name_zh: event.target.value,
              }))
            }
          />
          <label htmlFor={`${fieldId}-description-en`}>영문 설명</label>
          <textarea
            id={`${fieldId}-description-en`}
            value={form.description_en}
            disabled={disabled}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                description_en: event.target.value,
              }))
            }
          />
          <label htmlFor={`${fieldId}-description-zh`}>중문 설명</label>
          <textarea
            id={`${fieldId}-description-zh`}
            value={form.description_zh}
            disabled={disabled}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                description_zh: event.target.value,
              }))
            }
          />
        </div>
      )}
    </section>
  );
}
