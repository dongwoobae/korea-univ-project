"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function SlopesPage() {
  const [slopes, setSlopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchSlopes();
  }, []);

  async function fetchSlopes() {
    const { data } = await supabase
      .from("slope_segments")
      .select("id, name, gpx_file, segments, created_at")
      .order("created_at", { ascending: false });
    setSlopes(data ?? []);
    setLoading(false);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const name = selectedFile.name.replace(/\.gpx$/i, "");
      const text = await selectedFile.text();
      const xml = new DOMParser().parseFromString(text, "application/xml");
      if (xml.querySelectorAll("parsererror").length > 0) {
        throw new Error("GPX 파일을 파싱할 수 없습니다. 유효한 GPX 형식인지 확인하세요.");
      }

      const trkpts = Array.from(xml.querySelectorAll("trkpt"));
      const points = trkpts
        .map((pt) => ({
          lat: parseFloat(pt.getAttribute("lat")),
          lng: parseFloat(pt.getAttribute("lon")),
          ele: parseFloat(pt.querySelector("ele")?.textContent ?? "NaN"),
        }))
        .filter((p) => !isNaN(p.lat) && !isNaN(p.lng) && !isNaN(p.ele));

      if (points.length < 2) {
        alert("유효한 GPS 포인트가 부족합니다 (고도 데이터 포함 최소 2개 필요).");
        return;
      }

      const segments = points.map((p, i) => {
        if (i === 0) return { lat: p.lat, lng: p.lng, ele: p.ele, slope: 0, distance: 0 };
        const prev = points[i - 1];
        const dist = haversine(prev.lat, prev.lng, p.lat, p.lng);
        const rawSlope = dist > 0 ? Math.abs((p.ele - prev.ele) / dist) * 100 : 0;
        const slope = rawSlope > 30 ? 0 : rawSlope;
        return {
          lat: p.lat,
          lng: p.lng,
          ele: p.ele,
          slope: Math.round(slope * 10) / 10,
          distance: Math.round(dist * 10) / 10,
        };
      });

      const { error } = await supabase.from("slope_segments").insert({
        name,
        gpx_file: selectedFile.name,
        segments,
      });
      if (error) throw error;

      setSelectedFile(null);
      document.getElementById("gpx-input").value = "";
      await fetchSlopes();
    } catch (err) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`"${name}" 경로를 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("slope_segments").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    await fetchSlopes();
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>경사도 경로 관리</div>

      {/* 업로드 섹션 */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #e5e7eb", padding: 24, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>GPX 파일 업로드</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input
            id="gpx-input"
            type="file"
            accept=".gpx"
            onChange={(e) => setSelectedFile(e.target.files[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            style={{
              padding: "8px 20px",
              background: selectedFile && !uploading ? "#2563EB" : "#d1d5db",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: selectedFile && !uploading ? "pointer" : "not-allowed",
            }}
          >
            {uploading ? "처리 중..." : "업로드 & 저장"}
          </button>
        </div>
        {selectedFile && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
            경로명: <strong>{selectedFile.name.replace(/\.gpx$/i, "")}</strong>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#aaa" }}>
          파일명이 경로명으로 사용됩니다. 업로드 전 파일명을 원하는 경로명으로 변경하세요 (예: 정문-중앙광장.gpx)
        </div>
      </div>

      {/* 경로 목록 */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #e5e7eb", padding: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          등록된 경로 ({slopes.length}개)
        </div>
        {loading ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
        ) : slopes.length === 0 ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>등록된 경로가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {slopes.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {s.segments?.length ?? 0}개 포인트 · {new Date(s.created_at).toLocaleDateString("ko-KR")}
                    {s.gpx_file && (
                      <span style={{ marginLeft: 8, color: "#bbb" }}>({s.gpx_file})</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id, s.name)}
                  style={{
                    fontSize: 13,
                    color: "#DC2626",
                    background: "none",
                    border: "1px solid #DC2626",
                    borderRadius: 6,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
