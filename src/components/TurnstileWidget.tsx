"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  /** 토큰 만료·위젯 오류. 제출 버튼을 다시 막는다. */
  onExpire: () => void;
}

export default function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onExpire });

  useEffect(() => {
    handlers.current = { onToken, onExpire };
  }, [onToken, onExpire]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onExpire(),
          "error-callback": () => handlers.current.onExpire(),
        });
      })
      .catch(() => handlers.current.onExpire());
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={containerRef} className="ku-turnstile" />;
}
