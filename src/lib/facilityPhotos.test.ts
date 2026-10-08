import { describe, expect, it } from "vitest";
import { byUploadOrder } from "./facilityPhotos";

describe("byUploadOrder", () => {
  it("올린 시각 순서를 sort_order보다 먼저 따른다", () => {
    const photos = [
      { id: "later", sort_order: 0, created_at: "2026-10-02T00:00:00Z" },
      { id: "earlier", sort_order: 1, created_at: "2026-10-01T00:00:00Z" },
    ];
    expect([...photos].sort(byUploadOrder).map((photo) => photo.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("같은 시각이면 sort_order로 가른다", () => {
    const at = "2026-10-01T00:00:00Z";
    const photos = [
      { id: "b", sort_order: 2, created_at: at },
      { id: "a", sort_order: 0, created_at: at },
    ];
    expect([...photos].sort(byUploadOrder).map((photo) => photo.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
