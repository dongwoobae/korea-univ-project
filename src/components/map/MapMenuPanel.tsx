"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { visibleArea, type MenuPanel } from "./mapMenu";

/** 접힌 줄·모바일 아래 줄이 여는 패널의 자리. 설계: docs/specs/2026-10-27-map-menu-design.md 3·4장 */
export default function MapMenuPanel({
  layout,
  panel,
  title,
  children,
}: {
  layout: "rail" | "bar";
  panel: MenuPanel;
  title?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const followViewport = layout === "bar" && panel === "search";

  // 화상 키보드는 레이아웃 뷰포트가 아니라 보이는 영역을 줄이거나 옮긴다. 결과가 키보드 밑으로 들어가지 않게 패널을 그 안에 둔다(설계 4.2)
  useEffect(() => {
    const element = ref.current;
    if (!followViewport || !element) return;
    const viewport = window.visualViewport ?? null;
    const update = () => {
      const bar = document.querySelector(".ku-menu-nav--bar");
      const area = visibleArea({
        viewport,
        barTop: bar?.getBoundingClientRect().top ?? window.innerHeight,
      });
      element.style.setProperty("--ku-visible-top", `${area.top}px`);
      element.style.setProperty("--ku-visible-bottom", `${area.bottom}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [followViewport]);

  return (
    <div
      ref={ref}
      className="ku-menu-panel"
      data-layout={layout}
      data-panel={panel}
    >
      {title && <h2 className="ku-menu-panel-title">{title}</h2>}
      {children}
    </div>
  );
}
