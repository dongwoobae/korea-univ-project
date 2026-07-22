"use client";

const LANG_BUTTONS = [
  { code: "ko", label: "한국어", mobileLabel: "한", title: "한국어" },
  { code: "en", label: "EN", mobileLabel: "EN", title: "English" },
  { code: "zh", label: "中文", mobileLabel: "中", title: "中文" },
];

export default function LanguageSwitcher({
  isMobile,
  lang,
  setLang,
  panelOpen,
}) {
  return (
    <div
      className="ku-language"
      data-panel-open={panelOpen}
      aria-label="언어 선택"
    >
      {LANG_BUTTONS.map((language) => (
        <button
          key={language.code}
          type="button"
          onClick={() => setLang(language.code)}
          title={language.title}
          aria-pressed={lang === language.code}
        >
          {isMobile ? language.mobileLabel : language.label}
        </button>
      ))}
    </div>
  );
}
