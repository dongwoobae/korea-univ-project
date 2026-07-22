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
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
    ).toHaveAttribute("fill", "#963A32");
    await expect(page.locator('[data-testid^="landmark-marker-"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('[data-testid^="landmark-marker-"]').first(),
    ).toHaveText("🐿️");
    await expect(
      page.getByRole("button", { name: /캠퍼스 선택 0/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("button", { name: /시설 선택 0/ }),
    ).toHaveAttribute("aria-expanded", "false");
    const filterBox = await page.locator(".ku-filter-panel").boundingBox();
    expect(filterBox?.height).toBeLessThan(400);
    const attributionBox = await page.locator(".ku-attribution").boundingBox();
    expect(attributionBox?.x).toBe(20);
    const providerLinks = page.locator(".ku-attribution a");
    await expect(providerLinks).toHaveText(["OpenStreetMap", "CARTO"]);
    await expect(providerLinks.nth(0)).toHaveAttribute("target", "_blank");
    await expect(providerLinks.nth(0)).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await expect(providerLinks.nth(1)).toHaveAttribute(
      "href",
      "https://carto.com/attributions",
    );
    await expect(providerLinks.nth(1)).toHaveAttribute("target", "_blank");
    await expect(page.locator(".leaflet-control-attribution")).toContainText(
      "CARTO",
    );

    await page.getByRole("button", { name: "항공사진으로 전환" }).click();
    await expect(providerLinks).toHaveCount(1);
    await expect(providerLinks).toHaveText("Esri");
    await expect(providerLinks).toHaveAttribute("href", "https://www.esri.com");
    await expect(page.locator(".leaflet-control-attribution")).toContainText(
      "Esri",
    );
    const satelliteBuilding = page
      .locator(".leaflet-overlay-pane path.leaflet-interactive")
      .first();
    await expect(satelliteBuilding).toHaveAttribute("fill", "#963A32");
    await satelliteBuilding.click();
    await expect(page.getByText("중앙 엘리베이터")).toBeVisible();
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

  test("지도 위 UI의 더블클릭과 건물 툴팁을 지도에서 분리한다", async ({ page }) => {
    await page.goto("/");
    const building = page
      .locator(".leaflet-overlay-pane path.leaflet-interactive")
      .first();

    await building.hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await building.click();
    await page.mouse.move(700, 120);
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);

    const currentTileZoom = () =>
      page.locator(".leaflet-tile").evaluateAll((tiles) =>
        Math.max(
          ...tiles.map((tile) => {
            const match = (tile as HTMLImageElement).src.match(/light_all\/(\d+)\//);
            return match ? Number(match[1]) : 0;
          }),
        ),
      );
    const zoomBefore = await currentTileZoom();

    await page.locator(".ku-search-control").dblclick({ position: { x: 300, y: 10 } });
    await page.locator(".ku-filter-panel").dblclick({ position: { x: 300, y: 10 } });
    await page.locator(".ku-side-panel").dblclick({ position: { x: 170, y: 400 } });
    await page.waitForTimeout(350);

    expect(await currentTileZoom()).toBe(zoomBefore);
  });

  test("시설 유형, 명소, 경사도 필터가 지도 레이어를 제어한다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /시설 선택 0/ }).click();
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
    await page.getByRole("button", { name: /Facilities Selected 0/ }).click();
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
      page.getByRole("button", { name: /캠퍼스 선택 0/ }),
    ).toBeVisible();
    await expect(page.getByText("명소", { exact: true })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test("지도 영역 밖의 현재 위치는 이동하지 않고 안내한다", async ({ page }) => {
    await installMockBackend(page, {
      currentLocation: { latitude: 37.4, longitude: 127.1 },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "현재 위치" }).click();
    await expect(page.getByText("지도 영역 밖입니다")).toBeVisible();
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
