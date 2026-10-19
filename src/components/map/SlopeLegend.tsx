"use client";

import { useSlopeBands } from "@/lib/slopeBandsStore";
import SlopeBandsLegend from "./SlopeBandsLegend";

// 경사도를 켰을 때만 구독한다. 첫 구독이 범례 설정을 읽는다 — 레이어는 기본으로 꺼져 있다(설계 2.6)
function MapSlopeLegend() {
  const { bands } = useSlopeBands();
  return (
    <div className="ku-slope-legend">
      <SlopeBandsLegend bands={bands} />
    </div>
  );
}

export default function SlopeLegend({ show }: { show: boolean }) {
  return show ? <MapSlopeLegend /> : null;
}
