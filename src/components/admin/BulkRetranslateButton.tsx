"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { translateFacility } from "@/lib/facilityTranslation";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import type { FacilityWithType } from "@/types/domain";

interface BulkRetranslateButtonProps {
  facilities: FacilityWithType[];
  onDone: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function BulkRetranslateButton({
  facilities,
  onDone,
  showToast,
}: BulkRetranslateButtonProps) {
  const [run, setRun] = useState<{ total: number; done: number } | null>(null);
  const targets = facilities.filter(facilityNeedsTranslation);

  if (targets.length === 0) return null;

  async function handleClick() {
    const batch = targets;
    let failed = 0;
    // 파파고를 병렬로 두들기지 않는다.
    for (const [index, facility] of batch.entries()) {
      setRun({ total: batch.length, done: index + 1 });
      const ok = await translateFacility(facility);
      if (!ok) failed += 1;
    }
    // 재검증은 건마다가 아니라 마지막에 한 번.
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    setRun(null);
    await onDone();
    showToast(
      failed === 0
        ? `${batch.length}건을 번역했어요`
        : `${failed}건은 다시 실패했어요`,
      failed === 0 ? "success" : "warning",
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={run !== null}
      className="ku-admin-row-action"
      style={{
        fontSize: 12,
        padding: "4px 8px",
        // 다크모드에서 --ku-surface가 어두워진다. 색을 고정하면 대비가 무너지므로
        // 테마별로 뒤집히는 상태 토큰을 쓴다(라이트 #92400e ↔ 다크 #f1cb77).
        border: "1px solid var(--ku-status-warn-fg)",
        borderRadius: 6,
        background: "var(--ku-status-warn-bg)",
        color: "var(--ku-status-warn-fg)",
        fontWeight: 600,
        cursor: run !== null ? "wait" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {run
        ? `${run.total}건 중 ${run.done}건`
        : `번역 필요 ${targets.length}건 · 전부 재번역`}
    </button>
  );
}
