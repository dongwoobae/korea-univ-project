"use client";

import { useState, type RefObject } from "react";
import type { FacilityType } from "@/types/domain";
import FacilityFormModal from "@/components/admin/FacilityFormModal";

interface AddFacilityButtonProps {
  /** null이면 건물 비종속(독립) 시설 */
  buildingId: number | null;
  center: [number, number];
  facilityTypes: FacilityType[];
  onAdd: () => void;
  showToast: (message: string, type?: string) => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

export default function AddFacilityButton({
  buildingId,
  center,
  facilityTypes,
  onAdd,
  showToast,
  buttonRef,
}: AddFacilityButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        style={{
          fontSize: 13,
          padding: "8px 16px",
          background: "#2563EB",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        + 시설 추가
      </button>

      {open && (
        <FacilityFormModal
          buildingId={buildingId}
          center={center}
          facilityTypes={facilityTypes}
          facility={null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onAdd();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}
