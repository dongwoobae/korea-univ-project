export const BUILDING_PHOTO_BUCKET = "building-photos";

export const BUILDING_PHOTO_CACHE_CONTROL = "31536000";

export function buildingPhotoPath(
  buildingId: string | number,
  now: number,
  rand: string,
): string {
  return `${buildingId}/${now}-${rand}.webp`;
}

export function buildingPhotoPathFromUrl(url: string): string | null {
  return url.split(`/${BUILDING_PHOTO_BUCKET}/`)[1]?.split("?")[0] ?? null;
}
