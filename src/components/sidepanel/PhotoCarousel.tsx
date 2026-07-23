"use client";

import Image from "next/image";
import type { LangCode } from "@/lib/translations";
import type { BuildingPhoto } from "@/types/domain";

type PhotoRow = Pick<
  BuildingPhoto,
  "id" | "url" | "caption" | "caption_en" | "caption_zh"
>;

interface PhotoCarouselProps {
  photos: PhotoRow[];
  photoIndex: number;
  setPhotoIndex: (updater: number | ((i: number) => number)) => void;
  displayName: string;
  lang: LangCode;
  t: (key: string) => string;
}

export default function PhotoCarousel({
  photos,
  photoIndex,
  setPhotoIndex,
  displayName,
  lang,
  t,
}: PhotoCarouselProps) {
  return (
    <>
      {photos.length > 0 ? (
        <div
          style={{
            position: "relative",
            width: "calc(100% - 40px)",
            height: 150,
            margin: "16px 20px 0",
            background: "#000",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <Image
            src={photos[photoIndex]?.url}
            alt={displayName}
            fill
            sizes="(max-width: 767px) calc(100vw - 40px), 380px"
            unoptimized
            style={{
              objectFit: "cover",
            }}
          />
          {photos.length > 1 && (
            <>
              <button
                aria-label="이전 사진"
                onClick={() =>
                  setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)
                }
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.45)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ‹
              </button>
              <button
                aria-label="다음 사진"
                onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.45)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ›
              </button>
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                {photos.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`${i + 1}번째 사진`}
                    onClick={() => setPhotoIndex(i)}
                    style={{
                      width: i === photoIndex ? 16 : 6,
                      height: 6,
                      borderRadius: 3,
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      background:
                        i === photoIndex ? "#fff" : "rgba(255,255,255,0.5)",
                      transition: "width 0.2s",
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          style={{
            width: "calc(100% - 40px)",
            height: 150,
            margin: "16px 20px 0",
            borderRadius: 12,
            background: "var(--ku-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ku-text-3)",
            fontSize: 13,
          }}
        >
          {t("noPhoto")}
        </div>
      )}
      {photos[photoIndex]?.caption && (
        <div
          style={{
            margin: "0 20px",
            padding: "7px 10px",
            fontSize: 12,
            color: "var(--ku-text-2)",
            background: "var(--ku-bg)",
          }}
        >
          {lang === "ko"
            ? photos[photoIndex].caption
            : (photos[photoIndex][`caption_${lang}`] ??
              photos[photoIndex].caption)}
        </div>
      )}
    </>
  );
}
