export const FACILITY_PHOTO_BUCKET = "facility-photos";
export const FACILITY_REQUEST_PHOTO_BUCKET = "facility-request-photos";

/** 두 버킷의 file_size_limit과 같아야 한다(마이그레이션 20261008000000_create_facility_requests). */
export const MAX_FACILITY_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_FACILITY_PHOTOS = 3;
export const PHOTO_CACHE_CONTROL = "31536000";

/** 한 요청·시설의 파일은 그 id 폴더에만 둔다 — 정리와 실패 되돌리기가 폴더 단위다(설계 2.4). */
export function photoObjectPath(folderId: string, random: string): string {
  return `${folderId}/${random}.webp`;
}
