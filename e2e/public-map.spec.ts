import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("공개 지도 핵심 사용자 흐름", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
  });

  test("지도와 핵심 컨트롤을 로드한다", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByPlaceholder("건물 검색...")).toBeVisible();
    await expect(page.getByTitle("즐겨찾기")).toBeVisible();
    await expect(page.locator('[data-testid^="landmark-marker-"]')).toHaveCount(
      1,
    );
  });

  test("건물 검색, 상세 패널, 즐겨찾기 영속성을 연결한다", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await expect(page.getByText("중앙 엘리베이터")).toBeVisible();
    await page.getByRole("button", { name: "즐겨찾기 추가" }).click();
    await expect(
      page.getByRole("button", { name: "즐겨찾기 해제" }),
    ).toBeVisible();

    await page.reload();
    await page.getByTitle("즐겨찾기").click();
    await expect(page.getByText("즐겨찾기 (1)")).toBeVisible();
    await expect(page.getByText("중앙도서관", { exact: true })).toBeVisible();
  });

  test("시설 유형, 명소, 경사도 필터가 지도 레이어를 제어한다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /시설 0/ }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="facility-marker-f-uninstalled"]'),
    ).toHaveCount(0);

    await expect(page.locator('[data-testid^="landmark-marker-"]')).toHaveCount(
      1,
    );
    await page.getByRole("checkbox", { name: /명소/ }).uncheck();
    await expect(page.locator('[data-testid^="landmark-marker-"]')).toHaveCount(
      0,
    );

    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await expect(page.getByRole("checkbox", { name: /경사도/ })).toBeChecked();
  });

  test("영어와 중국어에서 시설과 명소 팝업을 번역한다", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("English").click();

    await expect(page.getByPlaceholder("Search buildings...")).toBeVisible();
    await page.getByRole("button", { name: /Facilities 0/ }).click();
    await page.getByRole("button", { name: /Ramp/ }).click();
    await page
      .locator('[data-testid="facility-marker-f-installed"]')
      .locator("..")
      .evaluate((marker: HTMLElement) => marker.click());
    await expect(page.getByText("Central Plaza Ramp")).toBeVisible();

    await page
      .locator('[data-testid^="landmark-marker-"]')
      .locator("..")
      .evaluate((marker: HTMLElement) => marker.click());
    await expect(
      page.locator(".leaflet-popup").getByText("Squirrel Trail"),
    ).toBeVisible();

    await page.getByTitle("中文").click();
    await expect(page.getByPlaceholder("搜索建筑...")).toBeVisible();
  });

  test("모바일 필터 드롭다운이 화면 안에서 동작한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: /시설 필터/ }).click();
    await expect(
      page.getByRole("button", { name: /캠퍼스 0/ }),
    ).toBeVisible();
    await expect(page.getByText("명소", { exact: true })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test("TTS와 음성 검색 미지원 피드백을 제공한다", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await page.getByRole("button", { name: "음성으로 읽기" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __spoken?: string }).__spoken ?? "",
        ),
      )
      .toContain("중앙도서관");

    await page.getByRole("button", { name: "닫기" }).click();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "이 브라우저는 음성 인식을 지원하지 않습니다",
      );
      await dialog.accept();
    });
    await page.getByTitle("음성 검색").click();
  });
});
