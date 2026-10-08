"use client";

import { useState } from "react";
import Image from "next/image";
import PhotoLightbox from "@/components/sidepanel/PhotoLightbox";
import { facilityPhotoUrl } from "@/lib/facilityPhotoUrl";
import type { FacilityPhoto } from "@/types/domain";

interface FacilityPhotoStripProps {
  photos: Pick<
    FacilityPhoto,
    "id" | "storage_path" | "sort_order" | "created_at"
  >[];
  facilityName: string;
  t: (key: string) => string;
}

// 업로드는 비어 있는 가장 작은 슬롯을 채우므로 삭제 뒤 새 사진이 sort_order 0을
// 받을 수 있다. 업로드 순서(created_at)를 먼저 따르고 같을 때만 sort_order로 가른다.
function byUploadOrder(
  a: FacilityPhotoStripProps["photos"][number],
  b: FacilityPhotoStripProps["photos"][number],
) {
  return (
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.sort_order - b.sort_order
  );
}

export default function FacilityPhotoStrip({
  photos,
  facilityName,
  t,
}: FacilityPhotoStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  const items = [...photos].sort(byUploadOrder).map((photo, index) => ({
    url: facilityPhotoUrl(photo.storage_path),
    alt: `${facilityName} ${t("facilityPhotoAlt")} ${index + 1}`,
    caption: null,
  }));

  return (
    <div className="ku-facility-photos">
      {items.map((item, index) => (
        <button
          key={item.url}
          type="button"
          className="ku-facility-photo-thumb"
          aria-label={item.alt}
          onClick={() => setOpenIndex(index)}
        >
          <Image
            src={item.url}
            alt=""
            width={64}
            height={64}
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </button>
      ))}
      {openIndex !== null && (
        <PhotoLightbox
          photos={items}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          title={facilityName}
          downloadBaseName={facilityName}
          t={t}
        />
      )}
    </div>
  );
}
