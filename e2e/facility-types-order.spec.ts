import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 4.2 — 종류 목록을 저장 순서가 아니라 sort_order로 읽는다.
// 목 백엔드는 종류를 고정 목록으로 돌려줘 정렬 결과는 흉내 내지 않는다. 요청이 정렬을 묻는지만 본다.
for (const screen of [
  { name: "공개 지도", path: "/", authenticated: false },
  {
    name: "관리자 시설 탭",
    path: "/admin/dashboard/facilities",
    authenticated: true,
  },
  { name: "관리자 건물 상세", path: "/admin/buildings/1", authenticated: true },
  {
    name: "관리자 제보함",
    path: "/admin/dashboard/inbox",
    authenticated: true,
  },
]) {
  test(`${screen.name}은 시설 종류를 sort_order, code 순으로 읽는다`, async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: screen.authenticated });
    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "GET" &&
        new URL(candidate.url()).pathname.endsWith("/rest/v1/facility_types"),
    );

    await page.goto(screen.path);

    expect(new URL((await request).url()).searchParams.get("order")).toBe(
      "sort_order.asc,code.asc",
    );
  });
}
