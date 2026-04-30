// src/lib/LanguageContext.js
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { translations } from "@/lib/translations";

const LanguageContext = createContext(null);

const STORAGE_KEY = "ku_map_lang";
const SUPPORTED = ["ko", "en", "zh"];

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("ko"); // SSR 기본값

  // 마운트 시 localStorage 확인
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) {
      setLangState(saved);
    }
  }, []);

  function setLang(newLang) {
    if (!SUPPORTED.includes(newLang)) return;
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }

  const t = (key) => translations[lang]?.[key] ?? translations.ko[key] ?? key;

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
