import { expect, test, type Page, type Route } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

const SQUIRREL_ID = "11111111-1111-1111-1111-111111111111";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "명소", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function landmarksRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/landmarks");
}

function serverError(route: Route) {
  return route.fulfill({
    status: 500,
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/json",
    body: "{}",
  });
}

/** 목 픽스처와 같은 모양의 명소 행 */
function landmark(overrides: Record<string, unknown>) {
  return {
    name_en: "EN",
    name_zh: "ZH",
    description: null,
    description_en: null,
    description_zh: null,
    icon: "🌳",
    lat: 37.5899,
    lng: 127.033,
    photo_url: "https://cdn.test/photo.webp",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** 최근 수정순 첫 페이지를 채움 명소로 채워 `l-second-page`를 2페이지로 민다 */
function addSecondPageLandmark(state: MockState) {
  for (let index = 0; index < 20; index += 1) {
    state.landmarks.push(
      landmark({
        id: `l-filler-${index}`,
        name: `채움 명소 ${index}`,
        updated_at: `2026-07-30T00:00:${String(index).padStart(2, "0")}Z`,
      }),
    );
  }
  state.landmarks.push(
    landmark({
      id: "l-second-page",
      name: "둘째 쪽 명소",
      updated_at: "2026-07-01T00:00:00Z",
    }),
  );
}

/** 사진이 없는 명소와 번역이 빈 명소를 더한다(다람쥐길은 둘 다 갖췄다) */
function addChipLandmarks(state: MockState) {
  state.landmarks.push(
    landmark({
      id: "l-no-photo",
      name: "사진 없는 연못",
      photo_url: null,
      updated_at: "2026-07-20T00:00:00Z",
    }),
    landmark({
      id: "l-no-translation",
      name: "번역 빈 정자",
      name_en: "",
      updated_at: "2026-07-10T00:00:00Z",
    }),
  );
}

test.describe("명소 작업 화면 — 목록과 지도", () => {
  test("칩·검색·정렬로 목록을 좁히고 칩 개수는 전체 기준이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const list = listPanel(page);

    await expect(
      list.getByText("지도에 표시하는 캠퍼스 명소 · 총 3개"),
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveText("3개 표시");
    await expect(
      list.getByRole("button", { name: "전체 3개" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      list.getByRole("button", { name: "사진 없음 1개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "번역 없음 1개" }),
    ).toBeVisible();

    await list.getByRole("button", { name: "사진 없음 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "사진 없는 연못",
    ]);
    await expect(list.getByRole("status")).toHaveText("1개 표시");

    await list.getByRole("button", { name: "번역 없음 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "번역 빈 정자",
    ]);

    await list.getByRole("button", { name: "전체 3개" }).click();
    const search = list.getByRole("searchbox", { name: "명소 검색" });
    await expect(search).toHaveAttribute(
      "placeholder",
      "명소명 또는 설명 검색",
    );
    await search.fill("Squirrel");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "다람쥐길",
    ]);
    // 거른 결과는 1개여도 칩 개수는 전체 기준이다
    await expect(list.getByRole("button", { name: "전체 3개" })).toBeVisible();

    await search.fill("없는 명소입니다");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    await list.getByLabel("명소 정렬").selectOption("name");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "다람쥐길",
      "번역 빈 정자",
      "사진 없는 연못",
    ]);
    await list.getByLabel("명소 정렬").selectOption("updated-asc");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "번역 빈 정자",
      "사진 없는 연못",
      "다람쥐길",
    ]);
  });

  test("행에 캠퍼스·수정일·배지를 보인다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    state.landmarks.push(
      landmark({
        id: "l-far",
        name: "먼 곳 명소",
        lat: 35.1,
        lng: 129.0,
      }),
    );
    await page.goto("/admin/dashboard/landmarks");

    await expect(listRow(page, "다람쥐길")).toContainText(/ · 수정 /);
    await expect(listRow(page, "먼 곳 명소")).toContainText(
      "캠퍼스 밖 · 수정 ",
    );
    await expect(listRow(page, "사진 없는 연못")).toContainText("사진 없음");
    await expect(listRow(page, "번역 빈 정자")).toContainText("번역 없음");
    await expect(listRow(page, "다람쥐길")).not.toContainText("사진 없음");
    await expect(listRow(page, "다람쥐길")).not.toContainText("번역 없음");
    await expect(listRow(page, "다람쥐길")).toContainText("🐿️");
  });

  test("거른 결과를 지도 마커로 그린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");

    await expect(
      page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-landmark-marker-l-no-photo"),
    ).toBeVisible();

    await listPanel(page)
      .getByRole("button", { name: "사진 없음 1개" })
      .click();
    await expect(
      page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("admin-landmark-marker-l-no-photo"),
    ).toBeVisible();
  });

  test("목록을 받지 못하면 패널 안에 오류와 다시 시도를 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failNext = true;
    await page.route(landmarksRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/landmarks");
    const list = listPanel(page);

    await expect(
      list.getByText("명소 목록을 불러오지 못했어요."),
    ).toBeVisible();
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(1);
  });

  test("행과 마커가 같은 선택이고 URL에 남는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const row = listRow(page, "사진 없는 연못");

    await page.getByTestId("admin-landmark-marker-l-no-photo").click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=l-no-photo$/);
    await expect(page.locator(".ku-landmark-marker--selected")).toHaveAttribute(
      "data-testid",
      "admin-landmark-marker-l-no-photo",
    );
    await expect(
      page.locator(".leaflet-tooltip-pane .ku-workspace-marker-tooltip"),
    ).toHaveText("사진 없는 연못");

    // 데스크톱에서는 같은 항목을 다시 누르면 선택을 푼다
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);

    await listRow(page, "번역 빈 정자").click();
    await expect(page).toHaveURL(/\?id=l-no-translation$/);
    // 칩을 바꾸면 선택을 푼다
    await listPanel(page)
      .getByRole("button", { name: "사진 없음 1개" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("다른 페이지에 있는 마커를 누르면 목록이 그 페이지로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addSecondPageLandmark(state);
    await page.goto("/admin/dashboard/landmarks");

    await page.getByTestId("admin-landmark-marker-l-second-page").click();
    await expect(
      listPanel(page).getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 명소")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("목록 조회가 늦게 끝나도 ?id= 링크가 그 명소를 연다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(landmarksRequest, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);

    await expect(listRow(page, "다람쥐길")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(detailPanel(page, "다람쥐길")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));
  });

  test("없는 ?id=는 선택을 풀고 알린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks?id=l-missing");

    await expect(
      page.getByText("명소를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });
});

test.describe("명소 작업 화면 — 상세 패널", () => {
  test("행을 누르면 상세 패널이 열리고 ✕로 닫는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "다람쥐길").click();
    const detail = detailPanel(page, "다람쥐길");

    await expect(
      detail.getByRole("heading", { name: "다람쥐길" }),
    ).toBeVisible();
    await detail.getByRole("button", { name: "상세 닫기" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("＋ 명소 추가는 새 명소 패널을 연다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();

    await expect(detailPanel(page, "명소 추가")).toBeVisible();
    await expect(page).toHaveURL(/\?new=1$/);
  });
});

test.describe("명소 작업 화면 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("상세는 지도 띠 없이 전체 화면으로 열리고 목록으로 돌아온다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const sheet = listPanel(page);

    await sheet.getByRole("button", { name: "목록 펼치기" }).click();
    const row = listRow(page, "다람쥐길");
    const rowBox = await row.boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(64);
    await row.click();

    const detail = detailPanel(page, "다람쥐길");
    await expect(
      detail.getByRole("heading", { name: "다람쥐길" }),
    ).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(detail.locator(".ku-detail-panel-strip")).toHaveCount(0);

    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });
});
