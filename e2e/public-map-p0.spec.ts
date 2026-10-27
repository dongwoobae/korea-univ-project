import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const MOBILE = { width: 390, height: 844 };

function menuNav(page: Page, name = "지도 메뉴") {
  return page.getByRole("navigation", { name });
}

test.describe("공개 지도 P0 개선 (모바일·데이터 오류)", () => {
  test("모바일에서 언어 드롭다운으로 세 언어를 전환한다", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    const trigger = page.locator(".ku-language-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    const listbox = page.getByRole("listbox", { name: "언어 선택" });
    await expect(listbox).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await listbox.getByRole("option", { name: "EN", exact: true }).click();
    await expect(
      menuNav(page, "Map menu").getByRole("button", { name: "Search" }),
    ).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);

    // 중국어로 재전환 가능
    await trigger.click();
    await page
      .getByRole("listbox")
      .getByRole("option", { name: "中文", exact: true })
      .click();
    await expect(
      menuNav(page, "地图菜单").getByRole("button", { name: "搜索" }),
    ).toBeVisible();

    // Escape로 닫힌다
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("모바일에서 패널이 닫혀 있으면 위쪽은 언어 버튼뿐이라 지도와 언어 선택을 가로채지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.waitForSelector(".ku-map-loading", { state: "detached" });

    // 언어 목록이 펼쳐지는 자리다. 메뉴가 닫혀 있으면 지도가 받아야 한다
    const triggerBox = (await page
      .locator(".ku-language-trigger")
      .boundingBox())!;
    const y = Math.round(triggerBox.y + triggerBox.height + 30);
    for (const x of [200, 260, 320, 370]) {
      const hitsMap = await page.evaluate(
        ({ x, y }) =>
          Boolean(
            document.elementFromPoint(x, y)?.closest(".leaflet-container"),
          ),
        { x, y },
      );
      expect(hitsMap, `x=${x} 지점을 지도가 받지 못한다`).toBe(true);
    }

    const langTrigger = page.locator(".ku-language-trigger");
    await langTrigger.click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(menuNav(page, "Map menu")).toBeVisible();

    await langTrigger.click();
    await page.getByRole("option", { name: "한국어", exact: true }).click();
    await expect(menuNav(page)).toBeVisible();
  });

  test("모바일 검색 패널의 닫기와 언어 버튼이 서로 붙지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await menuNav(page)
      .getByRole("button", { name: "검색", exact: true })
      .click();

    const close = (await page
      .getByRole("button", { name: "검색 닫기" })
      .boundingBox())!;
    const language = (await page
      .locator(".ku-language-trigger")
      .boundingBox())!;

    expect(language.x - (close.x + close.width)).toBeGreaterThanOrEqual(8);
    // 크기가 다르면 하나만 눌린 상태처럼 읽힌다
    expect(Math.round(language.width)).toBe(Math.round(close.width));
    expect(Math.round(language.height)).toBe(Math.round(close.height));
  });

  test("모바일에서 출처 표기가 아래 줄 위에 있고, 목록을 연 동안 지도 버튼을 치운다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    const attribution = (await page.locator(".ku-attribution").boundingBox())!;
    const bar = (await page.locator(".ku-menu-nav--bar").boundingBox())!;
    expect(bar.y - (attribution.y + attribution.height)).toBeGreaterThanOrEqual(
      4,
    );

    // 패널은 화면 폭을 다 쓰므로 열려 있는 동안 액션 버튼을 치운다
    const locate = page.getByRole("button", { name: "현 위치" });
    await expect(locate).toBeVisible();
    await menuNav(page).getByRole("button", { name: /^목록/ }).click();
    await expect(page.locator(".ku-map-browse-panel")).toBeVisible();
    await expect(locate).toBeHidden();

    await page.locator(".ku-map-browse-heading button").click();
    await expect(locate).toBeVisible();
  });

  test("모바일에서 즐겨찾기 진입점과 개수 배지를 노출한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "ku_favorites",
        JSON.stringify([
          { id: 1, name: "중앙도서관", name_en: "Central Library" },
        ]),
      );
    });
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    const favBtn = menuNav(page).getByRole("button", {
      name: "즐겨찾기 (1)",
    });
    await expect(favBtn).toBeVisible(); // 회귀: 이전에는 모바일에서 display:none
    await expect(favBtn.locator(".ku-menu-badge")).toHaveText("1");

    await favBtn.click();
    await expect(
      page
        .locator(".ku-favorites-list")
        .getByText("중앙도서관", { exact: true }),
    ).toBeVisible();
  });

  test("시설 API 실패를 오류 배너로 알리고 재시도로 복구한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    let failFacilities = true;
    await page.route("**/api/facilities", async (route) => {
      if (failFacilities)
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: "{}",
        });
      return route.fallback();
    });
    await page.goto("/");

    await expect(page.getByText("시설 정보를 불러오지 못했어요")).toBeVisible();
    const retry = page.getByRole("button", { name: "다시 시도" });
    await expect(retry).toBeVisible();

    // 재시도 성공 시 배너가 사라진다
    failFacilities = false;
    await retry.click();
    await expect(page.getByText("시설 정보를 불러오지 못했어요")).toHaveCount(
      0,
    );
  });

  test("건물 상세의 시설 조회 실패를 빈 상태가 아닌 오류로 구분한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.route("**/rest/v1/building_facilities**", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: "{}",
        });
      return route.fallback();
    });
    await page.goto("/");

    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await expect(
      page.getByText("접근성 정보를 불러오지 못했어요"),
    ).toBeVisible();
    // 오류를 "정보 없음"으로 오인하지 않는다
    await expect(page.getByText("등록된 접근성 정보가 없어요")).toHaveCount(0);
  });
});
