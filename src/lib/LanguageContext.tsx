"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { translations, type LangCode } from "@/lib/translations";

interface LanguageContextValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "ku_map_lang";
const SUPPORTED: LangCode[] = ["ko", "en", "zh"];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("ko"); // SSR 기본값

  // 마운트 시 localStorage 확인
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved as LangCode)) {
      const timer = window.setTimeout(() => setLangState(saved as LangCode), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  function setLang(newLang: LangCode) {
    if (!SUPPORTED.includes(newLang)) return;
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }

  const t = (key: string) =>
    translations[lang]?.[key] ?? translations.ko[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
