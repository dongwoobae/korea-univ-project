import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const currentTileZoom = (page: Page) =>
  page.locator(".leaflet-tile").evaluateAll((tiles) =>
    Math.max(
      ...tiles.map((tile) => {
        const match = (tile as HTMLImageElement).src.match(
          /light_all\/(\d+)\//,
        );
        return match ? Number(match[1]) : 0;
      }),
    ),
  );

test("건물명 라벨은 가까이 확대하면 은은하게 표시되고 언어를 반영한다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.goto("/");

  const map = page.locator(".leaflet-container");
  const mapShell = page.locator(".ku-map-shell");
  const buildingLabel = page.locator(".ku-building-label");

  await expect(buildingLabel).toHaveCount(1);
  await expect(mapShell).toHaveAttribute(
    "data-building-labels-visible",
    "false",
  );
  await expect(buildingLabel).toBeHidden();

  await page.getByTitle("English").click();
  await expect(buildingLabel).toHaveText("Central Library");

  await map.dblclick({ position: { x: 600, y: 400 } });
  await expect(mapShell).toHaveAttribute(
    "data-building-labels-visible",
    "true",
  );
  await expect(buildingLabel).toBeVisible();

  await page
    .locator(".leaflet-overlay-pane path.leaflet-interactive")
    .first()
    .dispatchEvent("mouseover", { clientX: 600, clientY: 400 });
  await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);
});

test("겹친 필터와 시설 목록은 마지막으로 누른 패널이 앞으로 온다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.goto("/");

  const filterPanel = page.locator(".ku-filter-panel");
  const browsePanel = page.locator(".ku-map-browse");

  await expect(filterPanel).toHaveAttribute("data-front", "true");
  await expect(browsePanel).toHaveAttribute("data-front", "false");

  await page.locator(".ku-map-browse-trigger").click();
  await expect(browsePanel).toHaveAttribute("data-front", "true");
  await expect(filterPanel).toHaveAttribute("data-front", "false");

  await page.locator(".ku-filter-heading").first().click();
  await expect(filterPanel).toHaveAttribute("data-front", "true");
  await expect(browsePanel).toHaveAttribute("data-front", "false");
});

test.describe("공개 지도 핵심 사용자 흐름", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
  });

  test("지도와 핵심 컨트롤을 로드한다", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByPlaceholder("건물 검색...")).toBeVisible();
    await expect(page.getByRole("button", { name: "현 위치" })).toContainText(
      "현 위치",
    );
    await expect(
      page.getByRole("button", { name: "위성 지도로 전환" }),
    ).toContainText("위성");
    await expect(page.getByTitle("즐겨찾기")).toBeVisible();
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
    ).toHaveAttribute("fill", "#963A32");
    await expect(page.locator('[data-testid^="landmark-marker-"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('[data-testid^="landmark-marker-"] svg.lucide-sparkles'),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /캠퍼스 영역/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("button", { name: "시설", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    const filterBox = await page.locator(".ku-filter-panel").boundingBox();
    expect(filterBox?.height).toBeLessThan(400);
    const attributionBox = await page.locator(".ku-attribution").boundingBox();
    expect(attributionBox?.x).toBe(20);
    const browseBox = await page
      .locator(".ku-map-browse-trigger")
      .boundingBox();
    expect(browseBox!.y + browseBox!.height).toBeLessThanOrEqual(
      attributionBox!.y,
    );
    const providerLinks = page.locator(".ku-attribution a");
    await expect(providerLinks).toHaveText([
      "OpenStreetMap",
      "CARTO",
      "Leaflet",
    ]);
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
    await expect(providerLinks.nth(2)).toHaveAttribute(
      "href",
      "https://leafletjs.com/",
    );
    // 공개 지도는 기본 컨트롤을 만들지 않는다. 만들어 두고 CSS로 가리면 그
    // 규칙이 전역이라 관리자 지도의 표기까지 함께 사라진다.
    await expect(page.locator(".leaflet-control-attribution")).toHaveCount(0);

    await page.getByRole("button", { name: "위성 지도로 전환" }).click();
    await expect(providerLinks).toHaveText([
      "OpenStreetMap",
      "Esri",
      "Leaflet",
    ]);
    await expect(providerLinks.nth(1)).toHaveAttribute(
      "href",
      "https://www.esri.com",
    );
    const satelliteBuilding = page
      .locator(".leaflet-overlay-pane path.leaflet-interactive")
      .first();
    await expect(satelliteBuilding).toHaveAttribute("fill", "#FF4D3D");
    await expect(satelliteBuilding).toHaveAttribute("fill-opacity", "0.42");
    await satelliteBuilding.click();
    await expect(page.getByText("중앙 엘리베이터")).toBeVisible();
  });

  test("건물 검색, 상세 패널, 즐겨찾기 영속성을 연결한다", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await expect(page.getByText("중앙 엘리베이터")).toBeVisible();

    const rampRow = page
      .locator(".ku-facility-row")
      .filter({ hasText: "북측 진입로" });
    await expect(rampRow).toContainText("경사로");
    await expect(rampRow.locator("svg.lucide-trending-up")).toHaveCount(1);

    await page.getByRole("button", { name: "즐겨찾기 추가" }).click();
    await expect(
      page.getByRole("button", { name: "즐겨찾기 해제" }),
    ).toBeVisible();

    await page.reload();
    await page.getByTitle("즐겨찾기").click();
    await expect(page.getByText("즐겨찾기 (1)")).toBeVisible();
    await expect(
      page
        .locator(".ku-favorites-list")
        .getByText("중앙도서관", { exact: true }),
    ).toBeVisible();
  });

  test("지도 위 UI의 더블클릭과 건물 툴팁을 지도에서 분리한다", async ({
    page,
  }) => {
    await page.goto("/");
    const building = page
      .locator(".leaflet-overlay-pane path.leaflet-interactive")
      .first();

    await building.hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await building.click();
    await page.mouse.move(700, 120);
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);

    const zoomBefore = await currentTileZoom(page);

    await page
      .locator(".ku-search-control")
      .dblclick({ position: { x: 300, y: 10 } });
    await page
      .locator(".ku-filter-panel")
      .dblclick({ position: { x: 300, y: 10 } });
    await page
      .locator(".ku-side-panel")
      .dblclick({ position: { x: 170, y: 400 } });
    await page.waitForTimeout(350);

    expect(await currentTileZoom(page)).toBe(zoomBefore);
  });

  test("시설 유형, 명소, 경사도 필터가 지도 레이어를 제어한다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "시설", exact: true }).click();
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

  test("낮은 줌에서 라벨과 가까운 마커를 정리하고 확대하면 펼친다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("landmark-label")).toHaveCount(0);
    await expect(page.getByTestId("subway-label")).toHaveCount(0);

    await page.getByRole("button", { name: "시설", exact: true }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await page.getByRole("button", { name: /엘리베이터/ }).click();

    await expect(page.getByTestId("facility-marker-cluster")).toHaveCount(1);
    await page
      .getByTestId("facility-marker-cluster")
      .locator("..")
      .evaluate((marker: HTMLElement) => marker.click());

    await expect(page.getByTestId("facility-marker-cluster")).toHaveCount(0);
    await expect(
      page.locator(
        '[data-testid^="facility-marker-"]:not([data-testid$="cluster"])',
      ),
    ).toHaveCount(3);
    // 유형별 클래스까지 봐야 세 마커가 모두 폴백 아이콘으로 떨어지는 회귀를 잡는다.
    await expect(
      page.locator(
        '[data-testid^="facility-marker-"]:not([data-testid$="cluster"]) svg.lucide-trending-up',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-testid^="facility-marker-"]:not([data-testid$="cluster"]) svg.lucide-arrow-up-down',
      ),
    ).toHaveCount(2);
    await expect(page.getByTestId("landmark-label")).toBeVisible();
    await expect(page.getByTestId("subway-label").first()).toBeVisible();
  });

  test("명소 라벨은 건물명 라벨과 같은 줌에서 나타난다", async ({ page }) => {
    await page.goto("/");

    const mapShell = page.locator(".ku-map-shell");
    await expect(mapShell).toHaveAttribute(
      "data-building-labels-visible",
      "false",
    );
    await expect(page.getByTestId("landmark-label")).toHaveCount(0);

    await page
      .locator(".leaflet-container")
      .dblclick({ position: { x: 600, y: 400 } });

    await expect(mapShell).toHaveAttribute(
      "data-building-labels-visible",
      "true",
    );
    expect(await currentTileZoom(page)).toBe(17);
    await expect(page.getByTestId("landmark-marker-cluster")).toHaveCount(0);
    await expect(page.getByTestId("landmark-label")).toBeVisible();
  });

  test("현재 지도 범위의 시설과 명소를 목록으로 탐색한다", async ({ page }) => {
    await page.goto("/");

    const browseTrigger = page.getByRole("button", {
      name: /현재 지도 목록 1/,
    });
    await expect(browseTrigger).toBeVisible();
    await browseTrigger.click();
    await expect(
      page.getByRole("heading", { name: "현재 지도 안의 시설과 명소" }),
    ).toBeVisible();
    await expect(page.getByText("다람쥐길", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "현재 지도 목록 닫기" }).click();
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await expect(
      page.getByRole("button", { name: /현재 지도 목록 2/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: /현재 지도 목록 2/ }).click();
    await page
      .getByRole("button", { name: /중앙광장 경사로.*지도 보기/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "현재 지도 안의 시설과 명소" }),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toBeVisible();
  });

  test("영어와 중국어에서 시설과 명소 팝업을 번역한다", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("English").click();

    await expect(page.getByPlaceholder("Search buildings...")).toBeVisible();
    await page.getByRole("button", { name: "Facilities", exact: true }).click();
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
      page.getByRole("button", { name: /캠퍼스 영역/ }),
    ).toBeVisible();
    await expect(page.getByText("명소", { exact: true })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test("시스템 색상 모드에 맞춰 기본 지도 타일을 교체한다", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect(
      page.locator('.leaflet-tile[src*="/dark_all/"]').first(),
    ).toBeAttached();
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
    ).toHaveAttribute("fill", "#FF4D3D");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(
      page.locator('.leaflet-tile[src*="/light_all/"]').first(),
    ).toBeAttached();
    await expect(page.locator('.leaflet-tile[src*="/dark_all/"]')).toHaveCount(
      0,
    );
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
    ).toHaveAttribute("fill", "#963A32");
  });

  test("피드백을 서버로 제출하고 개인정보 안내를 제공한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    await page.goto("/");

    await page.getByTitle("피드백 보내기").click();
    await expect(
      page.getByText("이름·연락처는 수집하지 않습니다", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "시설 정보 수정" }).click();
    await page
      .getByLabel("내용")
      .fill("중앙광장 경사로 위치를 다시 확인해주세요.");
    await page.getByRole("button", { name: "제출하기" }).click();

    await expect(
      page.getByText("피드백이 접수되었습니다", { exact: false }),
    ).toBeVisible();
    expect(state.feedbackSubmissions).toHaveLength(1);
    expect(state.feedbackSubmissions[0]).toMatchObject({
      type: "facility",
      content: "중앙광장 경사로 위치를 다시 확인해주세요.",
    });
  });

  test("피드백 서버 제출 실패 시 재시도와 메일 대안을 제공한다", async ({
    page,
  }) => {
    await page.route("**/api/feedback", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "test failure" }),
      }),
    );
    await page.goto("/");

    await page.getByTitle("피드백 보내기").click();
    await page.getByLabel("내용").fill("제출 실패 상태를 확인합니다.");
    await page.getByRole("button", { name: "제출하기" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "서버 제출에 실패했습니다" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "메일 앱으로 피드백 보내기" }),
    ).toHaveAttribute("href", /^mailto:/);
    await expect(page.getByRole("button", { name: "제출하기" })).toBeEnabled();
  });

  test("지도 영역 밖의 현재 위치는 이동하지 않고 안내한다", async ({
    page,
  }) => {
    await installMockBackend(page, {
      currentLocation: { latitude: 37.4, longitude: 127.1 },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "현 위치" }).click();
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
    await page.getByTitle("음성 검색").click();
    await expect(
      page.getByText("이 브라우저는 음성 인식을 지원하지 않습니다"),
    ).toBeVisible();
  });
});
