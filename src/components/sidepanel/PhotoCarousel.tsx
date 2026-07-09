"use client";

import type { LangCode } from "@/lib/translations";

interface PhotoCarouselProps {
  photos: any[];
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
        <div style={{ position: "relative", width: "100%", height: 160, background: "#000" }}>
          <img
            src={photos[photoIndex]?.url}
            alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {photos.length > 1 && (
            <>
              <button
                aria-label="이전 사진"
                onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                style={{
                  position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.45)", color: "#fff", border: "none",
                  borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >‹</button>
              <button
                aria-label="다음 사진"
                onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.45)", color: "#fff", border: "none",
                  borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >›</button>
              <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                {photos.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`${i + 1}번째 사진`}
                    onClick={() => setPhotoIndex(i)}
                    style={{
                      width: i === photoIndex ? 16 : 6, height: 6,
                      borderRadius: 3, border: "none", cursor: "pointer", padding: 0,
                      background: i === photoIndex ? "#fff" : "rgba(255,255,255,0.5)",
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
            width: "100%", height: 160, background: "#f5f5f5",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#aaa", fontSize: 13,
          }}
        >
          {t("noPhoto")}
        </div>
      )}
      {photos[photoIndex]?.caption && (
        <div
          style={{
            padding: "6px 14px",
            fontSize: 12,
            color: "#555",
            background: "#fafafa",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          {lang === "ko"
            ? photos[photoIndex].caption
            : (photos[photoIndex][`caption_${lang}`] ?? photos[photoIndex].caption)}
        </div>
      )}
    </>
  );
}
