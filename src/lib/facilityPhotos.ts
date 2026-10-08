export const FACILITY_PHOTO_BUCKET = "facility-photos";
export const FACILITY_REQUEST_PHOTO_BUCKET = "facility-request-photos";

/** 두 버킷의 file_size_limit과 같아야 한다(마이그레이션 20261008000000_create_facility_requests). */
export const MAX_FACILITY_PHOTO_BYTES = 4 * 1024 * 1024;
/** multipart 경계·필드 이름이 파일 크기에 더해진다. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const MAX_FACILITY_PHOTOS = 3;
export const PHOTO_CACHE_CONTROL = "31536000";

/** 한 요청·시설의 파일은 그 id 폴더에만 둔다 — 정리와 실패 되돌리기가 폴더 단위다(설계 2.4). */
export function photoObjectPath(folderId: string, random: string): string {
  return `${folderId}/${random}.webp`;
}

/**
 * 업로드는 비어 있는 가장 작은 슬롯을 채우므로 삭제 뒤 새 사진이 sort_order 0을
 * 받을 수 있다. 업로드 순서(created_at)를 먼저 따르고 같을 때만 sort_order로 가른다.
 */
export function byUploadOrder(
  a: { created_at: string; sort_order: number },
  b: { created_at: string; sort_order: number },
): number {
  return (
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.sort_order - b.sort_order
  );
}
