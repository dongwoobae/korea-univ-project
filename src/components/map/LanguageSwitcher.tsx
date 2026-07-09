"use client";

const LANG_BUTTONS = [
  { code: "ko", label: "한", title: "한국어" },
  { code: "en", label: "EN", title: "English" },
  { code: "zh", label: "中", title: "中文" },
];

export default function LanguageSwitcher({ isMobile, lang, setLang }) {
  return (
    <div
      style={{
        position: "absolute",
        ...(isMobile ? { top: 16, right: 16 } : { top: 60, left: 16 }),
        zIndex: 1000,
        background: "#fff",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#ddd",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        overflow: "hidden",
        display: "flex",
        flexDirection: isMobile ? "row" : "column",
      }}
    >
      {LANG_BUTTONS.map((l, i) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          title={l.title}
          style={{
            width: 36,
            height: isMobile ? 36 : 30,
            borderTopWidth: !isMobile && i > 0 ? 1 : 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            borderLeftWidth: isMobile && i > 0 ? 1 : 0,
            borderStyle: "solid",
            borderColor: "#eee",
            background: lang === l.code ? "#2563EB" : "#fff",
            color: lang === l.code ? "#fff" : "#555",
            fontSize: 12,
            fontWeight: lang === l.code ? 700 : 400,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
