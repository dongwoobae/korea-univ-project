"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SlopeRouteEditor from "@/components/SlopeRouteEditor";
import Toast from "@/components/Toast";
import type { SlopePoint } from "@/types/domain";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  async function handleSave(name: string, segments: SlopePoint[]) {
    setSaving(true);
    const { error } = await supabase.from("slope_segments").insert({
      name,
      gpx_file: null,
      segments: segments as unknown as Json,
    });
    setSaving(false);
    if (error) {
      // 그린 경로와 입력값을 날리지 않는다. 그대로 두고 재시도하게 한다.
      setToast({ message: "저장 실패: " + error.message, type: "error" });
      return;
    }
    router.push("/admin/dashboard/slopes");
  }

  if (!authChecked) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
      <SlopeRouteEditor
        initialName=""
        initialVertices={null}
        initialSlopes={[]}
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
