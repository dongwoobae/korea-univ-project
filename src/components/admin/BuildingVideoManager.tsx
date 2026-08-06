"use client";

import { useState } from "react";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import type { FacilityWithType } from "@/types/domain";

interface BuildingVideoManagerProps {
  facilities: FacilityWithType[];
  onChanged: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function BuildingVideoManager({
  facilities,
  onChanged,
  showToast,
}: BuildingVideoManagerProps) {
  const [picking, setPicking] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [target, setTarget] = useState<FacilityWithType | null>(null);

  const withVideo = facilities.filter((f) => f.video_url);
  const picked = facilities.find((f) => f.id === pickedId) ?? null;

  function confirmPick() {
    if (!picked) return;
    setTarget(picked);
    setPicking(false);
    setPickedId("");
  }

  return (
    <>
      {withVideo.length === 0 ? (
        <div
          style={{ padding: "12px 0", fontSize: 13, color: "var(--ku-text-3)" }}
        >
          등록된 동영상이 없어요
        </div>
      ) : (
        withVideo.map((f) => (
          <div key={f.id} className="ku-building-video-item">
            <span className="ku-building-video-item-body">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {f.name ?? f.facility_types?.label}
                {f.is_installed !== true && (
                  <span className="ku-building-video-unpublished">
                    공개 안 됨
                  </span>
                )}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--ku-text-2)",
                }}
              >
                {f.video_caption ?? "캡션 없음"}
              </span>
            </span>
            {/* 시설명은 버튼 밖 형제 요소라, 이름이 없으면 모든 버튼의
                접근 이름이 `관리 ›`로 같아져 스크린리더가 구분하지 못한다. */}
            <button
              type="button"
              className="ku-admin-row-action"
              aria-label={`${f.name ?? f.facility_types?.label} 동영상 관리`}
              onClick={() => setTarget(f)}
            >
              관리 ›
            </button>
          </div>
        ))
      )}

      {picking ? (
        <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
          <select
            aria-label="동영상을 추가할 시설"
            value={pickedId}
            onChange={(event) => setPickedId(event.target.value)}
          >
            <option value="">시설 선택</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name ?? f.facility_types?.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ku-admin-button ku-admin-button--primary"
            onClick={confirmPick}
            disabled={!picked}
          >
            확인
          </button>
          <button
            type="button"
            className="ku-admin-button"
            onClick={() => {
              // 선택을 남겨두면 다시 열었을 때 이전 시설이 이미 골라져 있고
              // 확인도 활성 상태라, 교체 대상이었던 경우 실수로 이어진다.
              setPicking(false);
              setPickedId("");
            }}
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ku-admin-button"
          disabled={facilities.length === 0}
          onClick={() => setPicking(true)}
          style={{ marginTop: 12 }}
        >
          + 동영상 추가
        </button>
      )}

      {picking && facilities.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ku-text-3)" }}>
          먼저 시설을 등록해 주세요
        </p>
      )}

      {picking && picked?.video_url && (
        <p style={{ fontSize: 12, color: "var(--ku-danger)" }}>
          기존 동영상이 교체됩니다
        </p>
      )}

      {target && (
        <FacilityVideoModal
          facility={target}
          onClose={() => setTarget(null)}
          onUpdate={onChanged}
          showToast={showToast}
        />
      )}
    </>
  );
}
