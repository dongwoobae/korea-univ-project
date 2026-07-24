import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const MOBILE = { width: 390, height: 844 };

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
    await expect(page.getByPlaceholder("Search buildings...")).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);

    // 중국어로 재전환 가능
    await trigger.click();
    await page
      .getByRole("listbox")
      .getByRole("option", { name: "中文", exact: true })
      .click();
    await expect(page.getByPlaceholder("搜索建筑...")).toBeVisible();

    // Escape로 닫힌다
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
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

    const favBtn = page.getByTitle("즐겨찾기");
    await expect(favBtn).toBeVisible(); // 회귀: 이전에는 모바일에서 display:none
    await expect(page.locator(".ku-favorite-badge")).toHaveText("1");

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
