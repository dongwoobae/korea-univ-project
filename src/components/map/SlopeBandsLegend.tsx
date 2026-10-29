"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { slopeBandRangeLabel, type SlopeBand } from "@/lib/slopeBands";
import { formatSlopeInput, percentToDeg } from "@/lib/slopeScale";
import "./slope-bands-legend.css";

type TooltipSource = "hover" | "pin" | "focus";

interface SlopeBandsLegendProps {
  bands: readonly SlopeBand[];
  /** 모달처럼 위가 스크롤 상자에 잘리는 곳에서는 아래 */
  tooltipPlacement?: "above" | "below";
  /** 모달이 툴팁이 열린 동안 자기 Esc 닫기를 끈다(설계 6.1) */
  onTooltipOpenChange?: (open: boolean) => void;
}

/** 공개 지도와 범례 편집 모달의 미리보기가 같이 쓴다. 저장소를 직접 읽지 않고 구간을 props로 받는다 */
export default function SlopeBandsLegend({
  bands,
  tooltipPlacement = "above",
  onTooltipOpenChange,
}: SlopeBandsLegendProps) {
  const [tooltip, setTooltip] = useState<{
    index: number;
    source: TooltipSource;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const openIndex =
    tooltip && tooltip.index < bands.length ? tooltip.index : null;
  const isOpen = openIndex !== null;
  const notifyOpenChange = useEffectEvent((open: boolean) =>
    onTooltipOpenChange?.(open),
  );

  useEffect(() => {
    if (!isOpen) return;
    notifyOpenChange(true);
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setTooltip(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      // 나중에 열린 글자 크기 칸이 이미 받은 Esc다(FontScaleControl)
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // 열린 지도 메뉴 패널이 같은 Esc에 닫히지 않게 한다(docs/specs/2026-10-27-map-menu-design.md 5.4)
      event.preventDefault();
      setTooltip(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      notifyOpenChange(false);
    };
  }, [isOpen]);

  const last = bands.length - 1;
  const boundaryLeft = (index: number) =>
    `${((index + 1) / bands.length) * 100}%`;
  const ticks = (unit: "percent" | "deg") =>
    bands.slice(0, last).map((band, index) =>
      band.upperPercent === null ? null : (
        <span key={index} style={{ left: boundaryLeft(index) }}>
          {formatSlopeInput(percentToDeg(band.upperPercent), unit)}
          {unit === "percent" ? "%" : "°"}
        </span>
      ),
    );

  return (
    <div
      ref={rootRef}
      className="ku-slope-bands"
      role="group"
      aria-label="경사도 범례"
      data-tooltip={tooltipPlacement}
    >
      <div className="ku-slope-bands-ticks" aria-hidden="true">
        {ticks("percent")}
      </div>
      <div className="ku-slope-bands-bar">
        {bands.map((band, index) => (
          <button
            key={index}
            type="button"
            className="ku-slope-bands-cell"
            style={{ "--band-color": band.color } as CSSProperties}
            aria-label={`${band.name}, ${slopeBandRangeLabel(bands, index)}`}
            aria-describedby={openIndex === index ? tooltipId : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              setTooltip((current) =>
                current?.index === index && current.source === "pin"
                  ? current
                  : { index, source: "hover" },
              );
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              setTooltip((current) =>
                current?.index === index && current.source === "hover"
                  ? null
                  : current,
              );
            }}
            onFocus={() =>
              setTooltip((current) =>
                current?.index === index ? current : { index, source: "focus" },
              )
            }
            onBlur={() =>
              setTooltip((current) =>
                current?.index === index && current.source === "focus"
                  ? null
                  : current,
              )
            }
            onClick={() =>
              setTooltip((current) =>
                current?.index === index && current.source === "pin"
                  ? null
                  : { index, source: "pin" },
              )
            }
          />
        ))}
      </div>
      <div className="ku-slope-bands-ticks" aria-hidden="true">
        {ticks("deg")}
      </div>
      {openIndex !== null && (
        // 툴팁은 범례 안이라 바깥 누르기로 닫히지 않는다. 모달에서는 아래 단위 버튼을 덮어, 누르면 툴팁만 닫는다
        <div
          id={tooltipId}
          role="tooltip"
          className="ku-slope-bands-tooltip"
          onClick={() => setTooltip(null)}
        >
          <strong>{bands[openIndex].name}</strong>
          {bands[openIndex].description && (
            <span>{bands[openIndex].description}</span>
          )}
        </div>
      )}
    </div>
  );
}
