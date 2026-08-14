"use client";

import { useEffect, useRef, useState } from "react";
import type { LangCode } from "@/lib/translations";

const LANG_BUTTONS: {
  code: LangCode;
  label: string;
  mobileLabel: string;
  title: string;
}[] = [
  { code: "ko", label: "한국어", mobileLabel: "한", title: "한국어" },
  { code: "en", label: "EN", mobileLabel: "EN", title: "English" },
  { code: "zh", label: "中文", mobileLabel: "中", title: "中文" },
];

export default function LanguageSwitcher({
  lang,
  setLang,
  panelOpen,
}: {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  panelOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);

  const current =
    LANG_BUTTONS.find((language) => language.code === lang) ?? LANG_BUTTONS[0];

  // 바깥 클릭(pointerdown) · Escape로 닫기
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 열릴 때 선택된 옵션에 초점
  useEffect(() => {
    if (!open) return;
    const selected =
      listboxRef.current?.querySelector<HTMLElement>(
        '[aria-selected="true"]',
      ) ?? listboxRef.current?.querySelector<HTMLElement>('[role="option"]');
    selected?.focus();
  }, [open]);

  function selectLang(code: LangCode) {
    setLang(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(
      listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
        [],
    );
    if (options.length === 0) return;
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[(index + 1) % options.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      options[(index - 1 + options.length) % options.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      options[options.length - 1]?.focus();
    }
  }

  return (
    <div
      className="ku-language"
      data-panel-open={panelOpen}
      data-open={open}
      aria-label="언어 선택"
      ref={rootRef}
    >
      {/* 데스크톱: 3버튼 인라인 */}
      <div className="ku-language-inline">
        {LANG_BUTTONS.map((language) => (
          <button
            key={language.code}
            type="button"
            onClick={() => setLang(language.code)}
            title={language.title}
            aria-pressed={lang === language.code}
          >
            {language.label}
          </button>
        ))}
      </div>

      {/* 모바일: 트리거 + 리스트박스 */}
      <button
        ref={triggerRef}
        className="ku-language-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`언어 선택 (${current.title})`}
        title={current.title}
        onClick={() => setOpen((value) => !value)}
      >
        {current.mobileLabel}
      </button>
      {open && (
        <div
          className="ku-language-listbox"
          role="listbox"
          aria-label="언어 선택"
          ref={listboxRef}
          onKeyDown={handleListKeyDown}
        >
          {LANG_BUTTONS.map((language) => (
            <button
              key={language.code}
              type="button"
              role="option"
              aria-selected={lang === language.code}
              onClick={() => selectLang(language.code)}
              title={language.title}
            >
              {language.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
