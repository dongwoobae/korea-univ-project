/** 관리자 사진 칸의 순서 바꾸기. 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.2·3.4 */

export type PhotoMoveDirection = "earlier" | "later";

/** 맞바꾸기 RPC 인자. DB 함수가 방향까지 보므로 화면 순서(앞 사진, 뒤 사진)로 준다. 끝이라 옮길 수 없으면 null. */
export function swapArgsFor(
  photos: readonly { id: number }[],
  index: number,
  direction: PhotoMoveDirection,
): { p_first: number; p_second: number } | null {
  const front = direction === "earlier" ? index - 1 : index;
  const back = front + 1;
  if (front < 0 || back >= photos.length) return null;
  return { p_first: photos[front].id, p_second: photos[back].id };
}

/**
 * 두 사진의 자리와 번호를 맞바꾼다. 같은 두 id로 다시 부르면 제자리라 실패 때 이것으로 되돌린다 — 누르기 전 배열로
 * 돌리면 저장 중에 끝난 캡션 저장까지 지운다.
 */
export function swapPhotos<T extends { id: number; sort_order: number }>(
  photos: T[],
  firstId: number,
  secondId: number,
): T[] {
  const first = photos.findIndex((photo) => photo.id === firstId);
  const second = photos.findIndex((photo) => photo.id === secondId);
  if (first < 0 || second < 0) return photos;
  const next = [...photos];
  next[first] = { ...photos[second], sort_order: photos[first].sort_order };
  next[second] = { ...photos[first], sort_order: photos[second].sort_order };
  return next;
}

/** `PT409`·`P0002`는 다른 관리자가 그사이 순서를 바꾸거나 지운 것이라 화면을 서버 순서로 다시 맞춘다. */
export function swapFailureAction(
  code: string | undefined,
): "reload" | "revert" {
  return code === "PT409" || code === "P0002" ? "reload" : "revert";
}

export function focusDirectionAfterMove(
  newIndex: number,
  count: number,
  direction: PhotoMoveDirection,
): PhotoMoveDirection {
  if (direction === "earlier" && newIndex === 0) return "later";
  if (direction === "later" && newIndex === count - 1) return "earlier";
  return direction;
}
