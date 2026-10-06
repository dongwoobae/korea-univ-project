/**
 * 사진은 Supabase Storage 공개 URL(사이트와 다른 origin)이라 <a download>가
 * 무시된다. Storage는 download 쿼리에 Content-Disposition: attachment로 답한다.
 * 저장된 URL에는 이미 ?t=가 있으므로 URL을 파싱해 붙인다(설계 2026-10-06 부록 B).
 */
export function photoDownloadUrl(photoUrl: string, fileName: string): string {
  const url = new URL(photoUrl);
  url.searchParams.set("download", fileName);
  return url.toString();
}

export function photoFileName(buildingName: string, index: number): string {
  return `${buildingName}-${index + 1}.webp`;
}
