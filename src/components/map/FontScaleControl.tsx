"use client";

import { useId } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { FONT_SCALES, type FontScale } from "@/lib/fontScale";
import { setFontScale, useFontScale } from "@/lib/useFontScale";

const STATUS_KEY: Record<FontScale, string> = {
  small: "fontScaleStatusSmall",
  normal: "fontScaleStatusNormal",
  large: "fontScaleStatusLarge",
};

const STEPS = [
  {
    delta: -1,
    nameKey: "fontScaleDown",
    glyphKey: "fontScaleDownGlyph",
    modifier: "smaller",
  },
  {
    delta: 1,
    nameKey: "fontScaleUp",
    glyphKey: "fontScaleUpGlyph",
    modifier: "larger",
  },
] as const;

/** 지도 버튼 열의 글자 크기 두 버튼(docs/specs/2026-10-28-font-scale-design.md 1장) */
export default function FontScaleControl() {
  const { t } = useLanguage();
  const scale = useFontScale();
  const statusId = useId();
  const index = FONT_SCALES.indexOf(scale);

  return (
    <div className="ku-font-scale" role="group" aria-label={t("fontScale")}>
      {STEPS.map(({ delta, nameKey, glyphKey, modifier }) => {
        const next = FONT_SCALES[index + delta];
        return (
          <button
            key={modifier}
            className={`ku-map-action ku-font-scale-button ku-font-scale-button--${modifier}`}
            type="button"
            aria-label={t(nameKey)}
            title={t(nameKey)}
            aria-describedby={statusId}
            // disabled면 끝 단계에 닿는 순간 초점을 잃는다(설계 1.1)
            aria-disabled={next ? undefined : true}
            onClick={() => {
              if (next) setFontScale(next);
            }}
          >
            {t(glyphKey)}
          </button>
        );
      })}
      <span id={statusId} className="ku-visually-hidden" aria-live="polite">
        {t(STATUS_KEY[scale])}
      </span>
    </div>
  );
}
