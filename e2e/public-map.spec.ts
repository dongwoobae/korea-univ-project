import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

function mobileMenuButton(page: Page, name: string | RegExp) {
  return page
    .getByRole("navigation", { name: "지도 메뉴" })
    .getByRole("button", { name, exact: typeof name === "string" });
}

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
      page.locator('[data-testid^="landmark-marker-"]'),
    ).toContainText("🐿️");
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
      .locator(".ku-facility-card")
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
        '[data-testid^="facility-marker-"]:not([data-testid$="cluster"]) svg.lucide-elevator',
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
    const squirrelTrailRow = page.getByRole("button", {
      name: /다람쥐길.*지도 보기/,
    });
    await expect(squirrelTrailRow.locator(".ku-map-browse-icon")).toContainText(
      "🐿️",
    );

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

  test("모바일 필터 패널이 화면 안에서 동작한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await mobileMenuButton(page, /^필터/).click();
    await expect(
      page.getByRole("button", { name: /캠퍼스 영역/ }),
    ).toBeVisible();
    await expect(page.getByText("명소", { exact: true })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test("모바일에서 피드백 모달이 지도 컨트롤 위를 덮는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByTitle("피드백 보내기").click();
    await expect(
      page.getByRole("dialog", { name: "피드백 보내기" }),
    ).toBeVisible();

    const controls = [
      ...(await page.locator(".ku-menu-nav--bar .ku-menu-button").all()),
      page.locator(".ku-language-trigger"),
    ];
    expect(controls).toHaveLength(6);
    for (const control of controls) {
      const label = (await control.getAttribute("aria-label")) ?? "";
      await expect(control).toBeVisible();
      const coveredByModal = await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return Boolean(hit?.closest(".ku-feedback-backdrop"));
      });
      expect(coveredByModal, `${label}가 피드백 모달 위로 튀어나온다`).toBe(
        true,
      );
    }
  });

  test("기기 색상 모드는 지도 타일을 바꾸지 않는다", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

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

  test("작은 화면에서 오류 안내가 붙어도 제출과 메일 대안에 닿는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route("**/api/feedback", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "test failure" }),
      }),
    );
    await page.goto("/");

    await page.getByTitle("피드백 보내기").click();
    await page
      .getByLabel("내용")
      .fill("작은 화면에서도 재시도할 수 있어야 한다");
    await page.getByRole("button", { name: "제출하기" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "서버 제출에 실패했습니다" }),
    ).toBeVisible();

    // 오류 문구가 붙으면 모달이 뷰포트보다 높아진다. 위아래 모두 닿아야 한다.
    const submit = page.getByRole("button", { name: "제출하기" });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "메일 앱으로 피드백 보내기" }),
    ).toBeInViewport();

    const title = page.getByRole("heading", { name: "피드백 보내기" });
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeInViewport();
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

test("건물 사진을 크게 보고 내려받는다", async ({ page }) => {
  const state = await installMockBackend(page);
  state.photos.push({
    id: 2,
    building_id: 1,
    url: "https://cdn.test/library-2.webp?t=1700000000001",
    caption: "열람실",
    caption_en: "Reading room",
    caption_zh: "阅览室",
    sort_order: 1,
  });
  await page.goto("/");
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();

  const open = page.getByRole("button", { name: "사진 크게 보기" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "중앙도서관", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 / 2");
  await expect(dialog).toContainText("정문");

  const href = await dialog
    .getByRole("link", { name: "사진 다운로드" })
    .getAttribute("href");
  const url = new URL(href!);
  expect(url.searchParams.get("t")).toBe("1700000000000");
  expect(url.searchParams.get("download")).toBe("중앙도서관-1.webp");

  await page.keyboard.press("ArrowRight");
  await expect(dialog).toContainText("2 / 2");
  await expect(dialog).toContainText("열람실");
  await dialog.getByRole("button", { name: "이전 사진" }).click();
  await expect(dialog).toContainText("1 / 2");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test.describe("공개 지도 — 경사도 범례", () => {
  function legendOf(page: Page) {
    return page.getByRole("group", { name: "경사도 범례" });
  }

  test("경사도를 켜면 지도 위에 구간 범례가 뜨고 경계 눈금만 늘 보인다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    const legend = legendOf(page);
    await expect(legend).toHaveCount(0);

    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await expect(legend).toBeVisible();
    for (const label of [
      "5.56%",
      "3.18°",
      "8.33%",
      "4.76°",
      "12.5%",
      "7.13°",
    ]) {
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    }
    for (const name of ["보도 기준 이내", "완화 범위", "특례 범위", "초과"]) {
      await expect(legend.getByText(name, { exact: true })).toHaveCount(0);
    }
    await expect(legend.getByRole("button")).toHaveCount(4);
    for (const name of [
      "보도 기준 이내, 5.56% 이하 (3.18°)",
      "완화 범위, 5.56–8.33% (3.18–4.76°)",
      "특례 범위, 8.33–12.5% (4.76–7.13°)",
      "초과, 12.5% 초과 (7.13°~)",
    ]) {
      await expect(
        legend.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }

    await page.getByRole("checkbox", { name: /경사도/ }).uncheck();
    await expect(legend).toHaveCount(0);
  });

  test("칸에 마우스를 올리거나 누르거나 포커스하면 이름·설명 툴팁이 뜬다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = legendOf(page);
    const tooltip = page.getByRole("tooltip");
    const first = legend.getByRole("button", { name: /^보도 기준 이내,/ });
    const last = legend.getByRole("button", { name: /^초과,/ });

    await first.hover();
    await expect(tooltip.locator("strong")).toHaveText("보도 기준 이내");
    await expect(tooltip).toContainText("보도 기준 1/18 이하");
    await expect(first).toHaveAccessibleDescription(/보도 기준 1\/18 이하/);
    await page.mouse.move(700, 120);
    await expect(tooltip).toHaveCount(0);

    // 설명이 빈 마지막 칸은 이름만. 눌러 연 툴팁은 마우스가 떠나도 남는다
    await last.click();
    await expect(tooltip).toHaveText("초과");
    await page.mouse.move(700, 120);
    await expect(tooltip).toHaveText("초과");
    await last.click();
    await expect(tooltip).toHaveCount(0);

    await last.click();
    await page.mouse.click(700, 120);
    await expect(tooltip).toHaveCount(0);

    await first.focus();
    await expect(tooltip.locator("strong")).toHaveText("보도 기준 이내");
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
  });

  test("열린 툴팁을 누르면 닫힌다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = legendOf(page);
    const tooltip = legend.getByRole("tooltip");

    await legend.getByRole("button", { name: /^완화 범위,/ }).click();
    await expect(tooltip).toContainText("완화 한도 1/12 이하");
    await tooltip.click();
    await expect(tooltip).toHaveCount(0);
  });

  test("데스크톱 범례는 지도 버튼 열 왼쪽에 바닥을 맞추고 건물 패널을 열면 같이 비킨다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const box = page.locator(".ku-slope-legend");
    const actions = page.locator(".ku-map-actions");
    await expect(box).toBeVisible();

    const legendBox = (await box.boundingBox())!;
    const actionsBox = (await actions.boundingBox())!;
    expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(actionsBox.x);
    expect(
      Math.abs(
        legendBox.y + legendBox.height - (actionsBox.y + actionsBox.height),
      ),
    ).toBeLessThanOrEqual(1);

    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    const panel = page.locator(".ku-side-panel");
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const moved = (await box.boundingBox())!;
        const panelBox = (await panel.boundingBox())!;
        return moved.x + moved.width <= panelBox.x;
      })
      .toBe(true);
  });

  test("저장된 범례가 있으면 선 색과 눈금이 그 값을, 깨졌으면 기본값을 따른다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.slopeBands = {
      bands: [
        { name: "낮음", upperPercent: 6, color: "#2E7D32", description: "" },
        { name: "중간", upperPercent: 12, color: "#F9A825", description: "" },
        { name: "높음", upperPercent: null, color: "#6A1B9A", description: "" },
      ],
    };
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = legendOf(page);
    await expect(legend.getByRole("button")).toHaveCount(3);
    await expect(legend.getByText("6%", { exact: true })).toBeVisible();
    await expect(legend.getByText("12%", { exact: true })).toBeVisible();
    // 목 경로 1은 3°(5.24%), 2는 7.2°(12.63%)다
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#2E7D32"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#6A1B9A"]'),
    ).toHaveCount(1);

    state.slopeBands = { bands: "broken" };
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await expect(legend.getByRole("button")).toHaveCount(4);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#E53935"]'),
    ).toHaveCount(1);
  });

  test("선마다 밑에 외곽선을 먼저 깔고 클릭은 선이 받는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const casings = page.locator(".leaflet-overlay-pane path.ku-slope-casing");
    await expect(casings).toHaveCount(2);
    await expect(casings.first()).toHaveAttribute("stroke", "#1C1917");
    await expect(casings.first()).toHaveAttribute("stroke-width", "8");
    await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.5");
    await expect(casings.and(page.locator(".leaflet-interactive"))).toHaveCount(
      0,
    );

    const order = await page
      .locator(".leaflet-overlay-pane path")
      .evaluateAll((paths) =>
        paths.map((path) =>
          path.classList.contains("ku-slope-casing")
            ? "casing"
            : (path.getAttribute("stroke") ?? ""),
        ),
      );
    expect(order.lastIndexOf("casing")).toBeLessThan(
      order.findIndex((stroke) => stroke === "#8BC34A" || stroke === "#E53935"),
    );

    await page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]').click();
    await expect(page.locator(".leaflet-popup")).toContainText("정문-중앙광장");

    await page.locator(".ku-theme-toggle").click();
    await expect(casings.first()).toHaveAttribute("stroke", "#FFFFFF");
    await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.6");
  });

  test("6구간에서도 경계 눈금 글자가 겹치지 않는다", async ({ page }) => {
    const state = await installMockBackend(page);
    state.slopeBands = {
      bands: [16.67, 33.33, 41.67, 58.33, 83.33, null].map(
        (upperPercent, index) => ({
          name: `구간 ${index + 1}`,
          upperPercent,
          color: "#8BC34A",
          description: "",
        }),
      ),
    };
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 375, height: 800 },
    ]) {
      const mobile = viewport.width < 768;
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (mobile) await mobileMenuButton(page, /^필터/).click();
      await page.getByRole("checkbox", { name: /경사도/ }).check();
      if (mobile) await mobileMenuButton(page, /^필터/).click();
      const legend = legendOf(page);
      await expect(legend.getByRole("button")).toHaveCount(6);

      const rows = await legend
        .locator(".ku-slope-bands-ticks")
        .evaluateAll((elements) =>
          elements.map((row) =>
            Array.from(row.children).map((tick) => {
              const box = tick.getBoundingClientRect();
              return [box.left, box.right];
            }),
          ),
        );
      expect(rows).toHaveLength(2);
      for (const ticks of rows) {
        expect(ticks).toHaveLength(5);
        for (let i = 1; i < ticks.length; i++)
          expect(ticks[i - 1][1]).toBeLessThanOrEqual(ticks[i][0]);
      }
    }
  });
});

test.describe("공개 지도 — 경사도 범례 (모바일)", () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true });

  test("필터를 닫아도 남고, 탭으로 툴팁을 열고 닫으며, 출처와 버튼 열을 비키고 건물을 열면 숨는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    const filter = mobileMenuButton(page, /^필터/);
    await filter.click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = page.getByRole("group", { name: "경사도 범례" });
    // 필터가 열린 동안은 버튼 열과 같은 규칙으로 숨는다
    await expect(legend).toBeHidden();
    await filter.click();
    await expect(legend).toBeVisible();

    const cell = legend.getByRole("button", { name: /^완화 범위,/ });
    await cell.tap();
    await expect(page.getByRole("tooltip")).toContainText(
      "완화 한도 1/12 이하",
    );
    await cell.tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await cell.tap();
    await page.getByRole("tooltip").tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const legendBox = (await page.locator(".ku-slope-legend").boundingBox())!;
    const attributionBox = (await page
      .locator(".ku-attribution")
      .boundingBox())!;
    const actionsBox = (await page.locator(".ku-map-actions").boundingBox())!;
    expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(
      attributionBox.y,
    );
    expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(actionsBox.x);

    await mobileMenuButton(page, "검색").click();
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    await expect(legend).toBeHidden();
  });
});
