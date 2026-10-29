"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { FONT_SCALES, parseStoredFontScale } from "@/lib/fontScale";
import { setFontScale, useFontScale } from "@/lib/useFontScale";

const MIN_SCALE = FONT_SCALES[0];
const MAX_SCALE = FONT_SCALES[FONT_SCALES.length - 1];
const SCALE_STEP = FONT_SCALES[1] - FONT_SCALES[0];

/** 지도 버튼 열의 글자 크기 버튼과 슬라이더 칸(docs/specs/2026-10-29-map-buttons-feedback-design.md 4.3) */
export default function FontScaleControl() {
  const { t } = useLanguage();
  const scale = useFontScale();
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);

  // 바깥 누름 · 바깥으로 간 초점 · Escape로 닫기. focusout은 칸 안 글자를 눌러 초점이 body로 갈 때도 나서 쓰지 않는다
  useEffect(() => {
    if (!open) return;
    function handleOutside(event: Event) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // 열린 지도 메뉴 패널이 같은 Esc에 닫히지 않게 한다(docs/specs/2026-10-27-map-menu-design.md 5.4)
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 열릴 때 슬라이더에 초점
  useEffect(() => {
    if (open) sliderRef.current?.focus();
  }, [open]);

  return (
    <div className="ku-font-scale" ref={rootRef}>
      <button
        ref={triggerRef}
        className="ku-map-action ku-map-action--labeled ku-font-scale-trigger"
        type="button"
        aria-label={t("fontScale")}
        // 이름은 보이는 글자 그대로 두고 지금 값은 설명으로 읽힌다(설계 4.3)
        title={`${t("fontScale")} ${scale}%`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ku-font-scale-glyph" aria-hidden="true">
          {t("fontScaleGlyph")}
        </span>
        <span className="ku-map-action-label">{t("fontScale")}</span>
      </button>
      {open && (
        <div id={popoverId} className="ku-font-scale-popover">
          <span
            className="ku-font-scale-end ku-font-scale-end--small"
            aria-hidden="true"
          >
            {t("fontScaleGlyph")}
          </span>
          <input
            ref={sliderRef}
            className="ku-font-scale-slider"
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={SCALE_STEP}
            value={scale}
            aria-label={t("fontScale")}
            aria-valuetext={`${scale}%`}
            onChange={(event) =>
              setFontScale(parseStoredFontScale(event.target.value))
            }
          />
          <span
            className="ku-font-scale-end ku-font-scale-end--large"
            aria-hidden="true"
          >
            {t("fontScaleGlyph")}
          </span>
          <span className="ku-font-scale-value" aria-hidden="true">
            {scale}%
          </span>
        </div>
      )}
    </div>
  );
}
