"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SlopeRouteEditor from "@/components/SlopeRouteEditor";
import Toast from "@/components/Toast";
import {
  isManualRoute,
  readStoredSlopes,
  readStoredVertices,
  type Vertex,
} from "@/lib/slopeRoute";
import type { SlopePoint, SlopeSegment } from "@/types/domain";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

export default function EditSlopeRoutePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [slopes, setSlopes] = useState<number[]>([]);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/admin");
        return;
      }

      const { data, error } = await supabase
        .from("slope_segments")
        .select("*")
        .eq("id", params.id)
        .single();

      if (cancelled) return;

      // GPX 행을 편집 가능하게 만들면 측정 원본이 훼손된다. 리다이렉트가
      // 즉시 언마운트되어 여기서 Toast를 띄워도 안 보이므로, 사유를 목록
      // 페이지로 넘겨 거기서 안내한다.
      if (data && !isManualRoute(data as unknown as SlopeSegment)) {
        router.push("/admin/dashboard/slopes?redirected=gpx");
        return;
      }
      if (error || !data) {
        router.push("/admin/dashboard/slopes");
        return;
      }

      const route = data as unknown as SlopeSegment;
      setName(route.name);
      setVertices(readStoredVertices(route.segments));
      setSlopes(readStoredSlopes(route.segments));
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  async function handleSave(nextName: string, segments: SlopePoint[]) {
    setSaving(true);
    const { error } = await supabase
      .from("slope_segments")
      .update({
        name: nextName,
        segments: segments as unknown as Json,
      })
      .eq("id", params.id);
    setSaving(false);
    if (error) {
      setToast({ message: "저장 실패: " + error.message, type: "error" });
      return;
    }
    router.push("/admin/dashboard/slopes");
  }

  if (loading) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 수정
      </h1>
      <SlopeRouteEditor
        initialName={name}
        initialVertices={vertices}
        initialSlopes={slopes}
        saving={saving}
        onSave={handleSave}
        onCancel={() => router.push("/admin/dashboard/slopes")}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
