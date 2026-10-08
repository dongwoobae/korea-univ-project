"use client";

import { useEffect, useMemo, useState } from "react";
import FacilityRequestList from "@/components/admin/inbox/FacilityRequestList";
import { supabase } from "@/lib/supabaseClient";

type Tab = "requests" | "feedback";

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("requests");
  const [building, setBuilding] = useState<number | null>(null);
  const [types, setTypes] = useState<{ code: string; label: string | null }[]>(
    [],
  );
  const [, setOpenId] = useState<string | null>(null);
  const [refreshKey] = useState(0);

  useEffect(() => {
    // useSearchParams는 Suspense 경계를 요구한다. 다른 관리자 화면처럼 location에서 읽는다.
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setTab(params.get("tab") === "feedback" ? "feedback" : "requests");
      const id = Number(params.get("building"));
      setBuilding(Number.isSafeInteger(id) && id > 0 ? id : null);
    }, 0);
    void supabase
      .from("facility_types")
      .select("code, label")
      .then(({ data }) => setTypes(data ?? []));
    return () => window.clearTimeout(timer);
  }, []);

  const typeLabels = useMemo(
    () => new Map(types.map((type) => [type.code, type.label ?? type.code])),
    [types],
  );

  function switchTab(next: Tab) {
    setTab(next);
    setBuilding(null);
    window.history.replaceState(
      null,
      "",
      next === "feedback" ? "?tab=feedback" : window.location.pathname,
    );
  }

  return (
    <div className="ku-admin-main">
      <div className="ku-admin-page-heading">
        <h1 className="ku-admin-title">제보함</h1>
      </div>
      <div className="ku-inbox-tabs" role="tablist" aria-label="제보 종류">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          onClick={() => switchTab("requests")}
        >
          등록 요청
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "feedback"}
          onClick={() => switchTab("feedback")}
        >
          피드백
        </button>
      </div>
      {tab === "requests" ? (
        <FacilityRequestList
          building={building}
          onClearBuilding={() => {
            setBuilding(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
          typeLabels={typeLabels}
          onOpen={setOpenId}
          refreshKey={refreshKey}
        />
      ) : null}
    </div>
  );
}
