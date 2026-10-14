import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "독립 시설", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function facilitiesRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/building_facilities");
}

/** 목 픽스처와 같은 모양의 독립 시설 행 */
function standaloneFacility(overrides: Record<string, unknown>) {
  return {
    building_id: null,
    facility_code: "ramp",
    name_en: "EN",
    name_zh: "ZH",
    translation_status: "translated",
    description: null,
    description_en: null,
    description_zh: null,
    floor_info: null,
    floor_info_en: null,
    floor_info_zh: null,
    is_installed: true,
    video_url: null,
    video_caption: null,
    facility_types: {
      code: "ramp",
      label: "경사로",
      label_en: "Ramp",
      label_zh: "坡道",
    },
    buildings: null,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

test.describe("독립 시설 작업 화면 — 목록과 지도", () => {
  test("칩·검색·유형·정렬로 목록을 좁히고 칩 개수는 전체 기준이다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    await expect(list.getByRole("status")).toHaveText("2개 표시");
    await expect(
      list.getByRole("button", { name: "전체 2개" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      list.getByRole("button", { name: "미설치 1개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "번역 필요 0개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "동영상 없음 2개" }),
    ).toBeVisible();
    // 유형별 클래스까지 봐야 모든 행이 폴백 아이콘으로 떨어지는 회귀를 잡는다.
    await expect(
      listRow(page, "중앙광장 경사로").locator("svg.lucide-trending-up"),
    ).toHaveCount(1);
    await expect(
      listRow(page, "공사 중 주차구역").locator("svg.lucide-square-parking"),
    ).toHaveCount(1);
    await expect(listRow(page, "공사 중 주차구역")).toContainText("미설치");

    await list.getByRole("button", { name: "미설치 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    await expect(list.getByRole("status")).toHaveText("1개 표시");

    await list.getByRole("button", { name: "전체 2개" }).click();
    const search = list.getByRole("searchbox", { name: "독립 시설 검색" });
    await search.fill("공사");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    await expect(
      list.getByRole("button", { name: "미설치 1개" }),
    ).toBeVisible();

    await search.fill("없는 시설");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    await list.getByLabel("독립 시설 정렬").selectOption("name");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
      "중앙광장 경사로",
    ]);

    await list.getByLabel("시설 유형 필터").selectOption("ramp");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "중앙광장 경사로",
    ]);
  });

  test("거른 결과를 지도 마커로 그리고 건물 소속 시설은 그리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    await expect(
      page.getByTestId("admin-facility-marker-f-installed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-facility-marker-f-uninstalled"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-facility-marker-f-building"),
    ).toHaveCount(0);

    await listPanel(page).getByRole("button", { name: "미설치 1개" }).click();
    await expect(
      page.getByTestId("admin-facility-marker-f-installed"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("admin-facility-marker-f-uninstalled"),
    ).toBeVisible();
  });

  test("목록을 받지 못하면 패널 안에 오류와 다시 시도를 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failNext = true;
    await page.route(facilitiesRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return route.fulfill({
          status: 500,
          headers: { "access-control-allow-origin": "*" },
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    await expect(
      list.getByText("시설 목록을 불러오지 못했어요."),
    ).toBeVisible();
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(2);
  });

  test("행과 마커가 같은 선택이고 URL에 남는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const row = listRow(page, "공사 중 주차구역");

    await page.getByTestId("admin-facility-marker-f-uninstalled").click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
    await expect(
      page.locator(".ku-workspace-marker--selected"),
    ).toHaveAttribute("data-testid", "admin-facility-marker-f-uninstalled");

    // 데스크톱에서는 같은 항목을 다시 누르면 선택을 푼다
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);

    await listRow(page, "중앙광장 경사로").click();
    await expect(page).toHaveURL(/\?id=f-installed$/);
    // 칩을 바꾸면 선택을 푼다
    await listPanel(page).getByRole("button", { name: "미설치 1개" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("다른 페이지에 있는 마커를 누르면 목록이 그 페이지로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    for (let index = 0; index < 20; index += 1) {
      state.facilities.push(
        standaloneFacility({
          id: `f-filler-${index}`,
          name: `채움 시설 ${index}`,
          lat: 37.6,
          lng: 127.05,
          updated_at: `2026-07-30T00:00:${String(index).padStart(2, "0")}Z`,
        }),
      );
    }
    state.facilities.push(
      standaloneFacility({
        id: "f-second-page",
        name: "둘째 쪽 시설",
        lat: 37.5899,
        lng: 127.033,
        updated_at: "2026-07-01T00:00:00Z",
      }),
    );
    await page.goto("/admin/dashboard/facilities");

    await page.getByTestId("admin-facility-marker-f-second-page").click();
    await expect(
      listPanel(page).getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 시설")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("목록 조회가 늦게 끝나도 ?id= 링크가 그 항목을 고른다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(facilitiesRequest, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto("/admin/dashboard/facilities?id=f-uninstalled");

    await expect(listRow(page, "공사 중 주차구역")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
  });

  test("없는 ?id=는 선택을 풀고 알린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-missing");

    await expect(
      page.getByText("시설을 찾지 못했어요. 삭제됐거나 주소가 틀렸어요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });
});
