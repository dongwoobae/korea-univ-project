"use client";

import { useEffect, useState } from "react";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function usePrefersDarkMode() {
  const [prefersDarkMode, setPrefersDarkMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MODE_QUERY);
    const syncPreference = () => setPrefersDarkMode(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return prefersDarkMode;
}
