"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useModalFocus } from "@/lib/useModalFocus";
import { photoDownloadUrl, photoFileName } from "@/lib/photoDownload";
import type { LangCode } from "@/lib/translations";
import type { SidePanelPhoto } from "@/components/SidePanel";

interface PhotoLightboxProps {
  photos: SidePanelPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** 다운로드 파일명용 원래 이름 */
  buildingName: string;
  /** 화면 표시용 이름(언어에 따라 다름) */
  displayName: string;
  lang: LangCode;
  t: (key: string) => string;
}

export default function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  buildingName,
  displayName,
  lang,
  t,
}: PhotoLightboxProps) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({ onClose });
  const count = photos.length;
  const photo = photos[index];

  useEffect(() => {
    if (count < 2) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % count);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [count, index, onIndexChange]);

  if (!photo) return null;
  const caption =
    lang === "ko" ? photo.caption : (photo[`caption_${lang}`] ?? photo.caption);

  // 사이드패널이 쌓임 맥락을 만들어 모달을 그 안에 가둔다. body로 뺀다(FeedbackButton과 같다).
  return createPortal(
    <div
      className="ku-photo-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ku-photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ku-photo-lightbox-header">
          <span id={titleId} className="ku-photo-lightbox-title">
            {displayName}
          </span>
          <span className="ku-photo-lightbox-count">
            {index + 1} / {count}
          </span>
          <a
            className="ku-photo-lightbox-action"
            href={photoDownloadUrl(
              photo.url,
              photoFileName(buildingName, index),
            )}
            aria-label={t("photoDownload")}
          >
            <Download size={18} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="ku-photo-lightbox-action"
            onClick={onClose}
            aria-label={t("closeLabel")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="ku-photo-lightbox-stage">
          <Image
            src={photo.url}
            alt={caption ?? displayName}
            fill
            sizes="100vw"
            unoptimized
            style={{ objectFit: "contain" }}
          />
          {count > 1 && (
            <>
              <button
                type="button"
                className="ku-photo-lightbox-action ku-photo-lightbox-nav ku-photo-lightbox-nav--prev"
                onClick={() => onIndexChange((index - 1 + count) % count)}
                aria-label={t("photoPrev")}
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ku-photo-lightbox-action ku-photo-lightbox-nav ku-photo-lightbox-nav--next"
                onClick={() => onIndexChange((index + 1) % count)}
                aria-label={t("photoNext")}
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {caption && <p className="ku-photo-lightbox-caption">{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}
