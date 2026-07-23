"use client";

import type { MapDataRetry, MapDataStatuses } from "./useMapData";

/** status가 error인 소스별 안내 메시지 키. */
const ERROR_MESSAGE_KEY: Record<keyof MapDataStatuses, string> = {
  buildings: "errBuildings",
  facilities: "errFacilities",
  slopes: "errSlopes",
  landmarks: "errLandmarks",
  facilityTypes: "errFacilityTypes",
};

const SOURCE_ORDER: (keyof MapDataStatuses)[] = [
  "buildings",
  "facilities",
  "slopes",
  "landmarks",
  "facilityTypes",
];

interface MapErrorBannerProps {
  statuses: MapDataStatuses;
  retry: MapDataRetry;
  t: (key: string) => string;
}

/**
 * 지도 상단에 뜨는 비차단 오류 배너. 데이터 소스별로 로드 실패를 알리고
 * 재시도 버튼을 제공한다. "정보 없음"(빈 상태) 문구와 시각적으로 구분된다.
 */
export default function MapErrorBanner({
  statuses,
  retry,
  t,
}: MapErrorBannerProps) {
  const failed = SOURCE_ORDER.filter((source) => statuses[source] === "error");
  if (failed.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: "min(92vw, 420px)",
      }}
    >
      {failed.map((source) => (
        <div
          key={source}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 14,
            color: "#991B1B",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true">⚠️</span>
            <span>{t(ERROR_MESSAGE_KEY[source])}</span>
          </span>
          <button
            type="button"
            onClick={() => retry[source]()}
            style={{
              flexShrink: 0,
              background: "#991B1B",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("errRetry")}
          </button>
        </div>
      ))}
    </div>
  );
}
