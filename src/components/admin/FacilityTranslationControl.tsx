"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { translateFacility } from "@/lib/facilityTranslation";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import type { FacilityWithType } from "@/types/domain";

interface FacilityTranslationControlProps {
  facility: FacilityWithType;
  onTranslated: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityTranslationControl({
  facility,
  onTranslated,
  showToast,
}: FacilityTranslationControlProps) {
  const [retrying, setRetrying] = useState(false);

  if (!facilityNeedsTranslation(facility)) return null;

  async function handleRetry() {
    setRetrying(true);
    const translated = await translateFacility(facility);
    if (translated) {
      await authedFetch("/api/revalidate-facilities", {
        method: "POST",
      }).catch(() => {});
      await onTranslated();
      showToast("시설 번역을 완료했어요");
    } else {
      showToast("자동 번역에 다시 실패했어요", "warning");
    }
    setRetrying(false);
  }

  return (
    <div className="ku-facility-translation-control">
      <span
        className="ku-facility-translation-badge"
        role="status"
        aria-label="번역 상태: 번역 필요"
      >
        번역 필요
      </span>
      <button type="button" onClick={handleRetry} disabled={retrying}>
        {retrying ? "번역 중..." : "재번역"}
      </button>
    </div>
  );
}
