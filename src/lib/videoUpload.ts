/**
 * 동영상 업로드 상한을 한 곳에 모은 모듈.
 *
 * 상한 숫자와 화면 문구가 따로 살면 조용히 어긋난다. 실제로 모달이 500MB를
 * 허용하면서 "최대 200MB"라고 안내하던 적이 있다 — presign 방식으로 갈아타며
 * 라벨만 옛 값에 남은 것이었다. 서버 라우트와 클라이언트 검사와 안내 문구가
 * 모두 여기서만 값을 가져간다.
 */

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/**
 * MB 표기, 소수 첫째 자리까지.
 *
 * 정수로 반올림하면 500.4MB가 "500MB"가 되어 `파일이 너무 커요 (500MB) ·
 * 최대 500MB`라는 자기모순 문구가 나온다. 딱 떨어지는 값은 `.0`이 자연히
 * 사라지므로 상한 라벨은 그대로 "500MB"다.
 */
export function formatFileSize(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

export const MAX_VIDEO_LABEL = formatFileSize(MAX_VIDEO_BYTES);

/**
 * 초과분 표기 전용. **올림**한다.
 *
 * 반올림하면 상한을 1바이트 넘긴 파일도 상한과 같은 표기가 되어
 * `파일이 너무 커요 (500MB) · 최대 500MB`라는 자기모순 문구가 나온다.
 * 소수 첫째 자리로 좁혀도 500.05MB까지는 여전히 겹친다.
 */
export function formatExcessSize(bytes: number): string {
  return `${Math.ceil((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

/**
 * 상한 초과 여부. **표기가 아니라 바이트로 판정한다** — 500.4MB는 반올림하면
 * "500MB"로 보이지만 서버는 거절한다.
 */
export function exceedsVideoLimit(bytes: number): boolean {
  return bytes > MAX_VIDEO_BYTES;
}

/**
 * 시설 동영상이 놓이는 R2 키 접두사.
 *
 * 발급(presign)·저장(confirm)·삭제(delete)가 이 규칙 하나를 공유해야 한다.
 * 셋이 각자 문자열을 만들면 한 곳만 느슨해져도 경계가 뚫린다.
 */
export function facilityVideoKeyPrefix(facilityId: string): string {
  return `facility-videos/${facilityId}/`;
}

export function facilityVideoKey(
  facilityId: string,
  ext: string,
  timestamp: number,
): string {
  return `${facilityVideoKeyPrefix(facilityId)}${timestamp}.${ext}`;
}

/**
 * 이 키가 **이 시설의 것**인지.
 *
 * confirm이 이걸 보지 않으면 `landmark-photos/...` 같은 남의 키를 시설에
 * 심어둔 뒤 delete를 호출해 같은 버킷의 임의 객체를 지울 수 있다.
 * delete의 `.eq("video_url", ...)` 가드는 심어둔 값과도 일치하므로 막지 못한다.
 */
export function isFacilityVideoKey(key: string, facilityId: string): boolean {
  const prefix = facilityVideoKeyPrefix(facilityId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}

/**
 * 크기 값이 검사에 쓸 만한지.
 *
 * 서버가 이걸 먼저 보지 않으면 `fileSize`를 아예 빼고 호출하는 것만으로
 * 상한 검사를 통째로 지나간다 — `undefined > MAX`는 false다.
 */
export function isValidFileSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
