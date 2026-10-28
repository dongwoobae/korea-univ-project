"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./map/Map"), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: "100%", height: "100vh", background: "var(--ku-bg)" }}
    />
  ),
});

export default function MapWrapper() {
  return <Map />;
}
