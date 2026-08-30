"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { buildSegments, type Vertex } from "@/lib/slopeRoute";
import "../../admin-ui.css";

// leaflet을 정적 import하므로 서버에서 실행되면 window가 없어 터진다.
const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  {
    ssr: false,
  },
);

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [slopes, setSlopes] = useState<(number | null)[]>([]);
  const [mapKey, setMapKey] = useState(0);

  // /admin/slopes/*는 대시보드 레이아웃 밖이라 인증을 상속받지 못한다.
  // buildings/new와 같은 방식으로 페이지가 직접 확인한다.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    // 꼭짓점 개수는 그리기 이후 바뀌지 않는다. 길이가 다르면 새로 그린 것이다.
    setSlopes((prev) => {
      const count = Math.max(0, next.length - 1);
      if (prev.length === count) return prev;
      return Array.from({ length: count }, () => null);
    });
  }, []);

  function handleReset() {
    setVertices([]);
    setSlopes([]);
    setMapKey((key) => key + 1);
  }

  if (!authChecked) return null;

  const segments = buildSegments(vertices);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
      <SlopeRouteMap
        key={mapKey}
        initialVertices={null}
        onVerticesChange={handleVerticesChange}
        slopes={slopes}
      />
      {segments.length > 0 && (
        <>
          <ul style={{ marginTop: 16, paddingLeft: 20 }}>
            {segments.map((segment) => (
              <li key={segment.index} style={{ fontSize: 13 }}>
                구간 {segment.index + 1} · {segment.distance}m
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleReset}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              background: "none",
              border: "1px solid var(--ku-danger)",
              color: "var(--ku-danger)",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            지우고 다시 그리기
          </button>
        </>
      )}
    </div>
  );
}
