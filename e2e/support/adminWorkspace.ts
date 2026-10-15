/**
 * 관리자 작업 화면(독립 시설·명소·경사도)과 제보함 spec이 같이 쓰는 헬퍼.
 * 목 백엔드와 상관없는 화면 쪽 도구라 `mockBackend.ts`와 따로 둔다.
 */
import type { Page, Route } from "@playwright/test";

/** 저장 안 한 변경 확인 창의 제목(`UnsavedChangesGuard`) */
const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";

export function leaveDialog(page: Page) {
  return page.getByRole("dialog", { name: LEAVE_TITLE });
}

/** 진행 중인 작업이 있을 때의 확인 창의 제목(`UnsavedChangesGuard`) */
const BUSY_TITLE = "처리 중인 작업이 있어요";

export function busyDialog(page: Page) {
  return page.getByRole("dialog", { name: BUSY_TITLE });
}

/**
 * 지금 페이지를 떠나면 브라우저가 묻는지. E2E는 브라우저의 새로고침 경고를 보지 못해 같은 이벤트를 직접 내 가드가
 * 막는지 본다. 가드 등록은 effect라 편집 직후에 한 번 읽으면 앞지르므로 항상 `expect.poll`로 기다린다.
 */
export function unloadBlocked(page: Page) {
  return page.evaluate(
    () =>
      !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  );
}

export function adminNav(page: Page) {
  return page.getByRole("navigation", { name: "관리자 메뉴" });
}

/** 상세 패널은 고른 항목의 이름을 이름으로 갖는 region이다 */
export function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

/** Supabase REST가 실패한 것처럼 500으로 답한다. 브라우저가 CORS로 막지 않게 출처 헤더를 단다 */
export function serverError(route: Route) {
  return route.fulfill({
    status: 500,
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/json",
    body: "{}",
  });
}
