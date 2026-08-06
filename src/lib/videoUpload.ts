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
 * 상한 초과 여부. **표기가 아니라 바이트로 판정한다** — 500.4MB는 반올림하면
 * "500MB"로 보이지만 서버는 거절한다.
 */
export function exceedsVideoLimit(bytes: number): boolean {
  return bytes > MAX_VIDEO_BYTES;
}
