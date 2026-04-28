"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100vh", background: "#f5f5f0" }} />
  ),
});

export default function MapWrapper() {
  return <Map />;
}
