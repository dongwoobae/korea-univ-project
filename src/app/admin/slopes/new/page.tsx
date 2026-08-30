"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import "../../admin-ui.css";

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

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

  if (!authChecked) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
    </div>
  );
}
