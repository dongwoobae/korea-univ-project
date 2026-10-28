"use client";

import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { setColorMode, useColorMode } from "@/lib/useColorMode";

/** 공개 지도 토글. 누르면 갈 모드를 보인다(docs/specs/2026-10-28-dark-mode-design.md 1.1) */
export default function ThemeToggleButton({
  className,
  labelClassName,
  iconSize,
}: {
  className: string;
  labelClassName: string;
  iconSize: number;
}) {
  const { t } = useLanguage();
  const dark = useColorMode() === "dark";
  const name = t(dark ? "themeToLight" : "themeToDark");
  const Icon = dark ? Sun : Moon;
  return (
    <button
      className={`${className} ku-theme-toggle`}
      type="button"
      aria-label={name}
      title={name}
      onClick={() => setColorMode(dark ? "light" : "dark")}
    >
      <Icon size={iconSize} aria-hidden="true" />
      <span className={labelClassName}>
        {t(dark ? "themeToLightLabel" : "themeToDarkLabel")}
      </span>
    </button>
  );
}
