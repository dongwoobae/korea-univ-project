import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import {
  installMockBackend,
  stationBuildingRow,
  type MockState,
} from "./support/mockBackend";
import {
  leaveDialog,
  unloadBlocked,
  adminNav,
  detailPanel,
  serverError,
} from "./support/adminWorkspace";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "경사도 경로", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function routeLine(page: Page, id: number) {
  return page.locator(`path.ku-slope-route-${id}`);
}

function editPanel(page: Page, name: string) {
  return detailPanel(page, `${name} 편집`);
}

function newPanel(page: Page) {
  return detailPanel(page, "새 경로");
}

function editMap(page: Page) {
  return page.locator(".ku-slope-route-map");
}

function previewLines(page: Page) {
  return page.locator(
    ".leaflet-pane.slope-preview-pane path:not(.ku-slope-casing)",
  );
}

function blueDot(page: Page) {
  return page.locator('.leaflet-container path[fill="#2563EB"]');
}

interface Point {
  x: number;
  y: number;
}

// 목록 패널(왼쪽)·상세 패널(오른쪽)·줌 버튼에 가리지 않는 지도 위의 점들
const TWO_POINTS: Point[] = [
  { x: 540, y: 220 },
  { x: 660, y: 300 },
];
const THREE_POINTS: Point[] = [
  { x: 540, y: 220 },
  { x: 640, y: 300 },
  { x: 740, y: 380 },
];

function toolbar(page: Page) {
  return page.getByRole("toolbar", { name: "경로 편집 도구" });
}

function tool(page: Page, name: string) {
  return toolbar(page).getByRole("button", { name, exact: true });
}

/** 도구 바로 그리기를 켜고 점을 찍은 뒤 끝내기로 끝낸다 */
async function drawRoute(page: Page, points: Point[]) {
  const map = editMap(page);
  await tool(page, "그리기").click();
  for (const position of points) await map.click({ position });
  await tool(page, "끝내기").click();
}

/** fitBounds 애니메이션이 끝나 자리가 멈춘 뒤의 가운데 */
async function settledCenter(locator: Locator): Promise<Point> {
  let previous: Point | null = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const box = await locator.boundingBox();
    if (box) {
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (
        previous &&
        Math.abs(previous.x - center.x) < 0.5 &&
        Math.abs(previous.y - center.y) < 0.5
      ) {
        return center;
      }
      previous = center;
    }
    await locator.page().waitForTimeout(100);
  }
  throw new Error("지도가 멈추지 않았다");
}

function expectNear(actual: Point, expected: Point, tolerance: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
}

/** 선이 목록 패널과 상세 패널 사이 지도 안에 다 보이는지 */
async function placementBetweenPanels(
  page: Page,
  line: Locator,
  detail: Locator,
) {
  const [lineBox, listBox, detailBox, mapBox] = await Promise.all([
    line.boundingBox(),
    listPanel(page).boundingBox(),
    detail.boundingBox(),
    page.locator(".ku-map-workspace-map").boundingBox(),
  ]);
  if (!lineBox) return "선이 보이지 않음";
  if (!listBox || !detailBox || !mapBox) return "잴 수 없음";
  const left = listBox.x + listBox.width;
  const right = detailBox.x;
  return lineBox.x >= left &&
    lineBox.x + lineBox.width <= right &&
    lineBox.y >= mapBox.y &&
    lineBox.y + lineBox.height <= mapBox.y + mapBox.height
    ? "사이"
    : `벗어남 (선 x ${Math.round(lineBox.x)}~${Math.round(lineBox.x + lineBox.width)} y ${Math.round(lineBox.y)}~${Math.round(lineBox.y + lineBox.height)}, 패널 사이 x ${Math.round(left)}~${Math.round(right)})`;
}

/**
 * 지도가 옮기기 시작하면(Leaflet이 지도 판에 이동 애니메이션 클래스를 달면) 그 자리에서 버튼을 누르도록 다음 탐색부터
 * 페이지에 걸어 둔다. Playwright의 click은 대기와 확인을 거쳐 이동(약 250ms)이 끝난 뒤에 닿을 수 있다
 */
async function clickWhenMapStartsMoving(
  page: Page,
  options: { map: string; panel: string; button: string },
) {
  await page.addInitScript(({ map, panel, button }) => {
    const observer = new MutationObserver(() => {
      const pane = document.querySelector(`${map} .leaflet-map-pane`);
      if (!pane?.matches(".leaflet-zoom-anim, .leaflet-pan-anim")) return;
      const target = [
        ...document.querySelectorAll(`[aria-label="${panel}"] button`),
      ].find((element) => element.textContent?.trim() === button);
      if (!(target instanceof HTMLButtonElement)) return;
      observer.disconnect();
      target.click();
    });
    observer.observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }, options);
}

/** 지도를 바꿔 끼우는 동안 정리된 Leaflet 지도가 남긴 미처리 예외를 모은다 */
function collectLeafletErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message.includes("_leaflet_pos")) errors.push(error.message);
  });
  return errors;
}

async function dotOffsetFromCenter(page: Page) {
  const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
  const dotBox = (await blueDot(page).boundingBox())!;
  return {
    x: dotBox.x + dotBox.width / 2 - (mapBox.x + mapBox.width / 2),
    y: dotBox.y + dotBox.height / 2 - (mapBox.y + mapBox.height / 2),
  };
}

const NEAR_CENTER = { latitude: 37.5893, longitude: 127.034 };

function slopesRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/slope_segments");
}

async function confirmDelete(detail: Locator) {
  await detail.getByRole("button", { name: "삭제", exact: true }).click();
  await detail
    .getByRole("group", { name: "삭제 확인" })
    .getByRole("button", { name: "삭제" })
    .click();
}

/** 목 픽스처와 같은 저장 형식의 경로 행. 기본 선은 패널에 가리지 않는 지도 가운데 오른쪽에 놓인다 */
function slopeRow(overrides: Record<string, unknown>) {
  return {
    gpx_file: null,
    segments: [
      { lat: 37.5893, lng: 127.0335 },
      { lat: 37.5894, lng: 127.0337, slope: 2, distance: 20.3 },
    ],
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** 여러 구간 색이 섞인 경로와 저장 형식이 깨진 경로를 더한다 */
function addMixedRoutes(state: MockState) {
  state.slopes.push(
    slopeRow({
      id: 3,
      name: "급경사 계단길",
      segments: [
        { lat: 37.5896, lng: 127.031 },
        { lat: 37.5897, lng: 127.0312, slope: 20, distance: 20 },
        { lat: 37.5898, lng: 127.0314, slope: 6, distance: 20.1 },
      ],
      updated_at: "2026-09-10T00:00:00Z",
    }),
    slopeRow({
      id: 4,
      name: "깨진 경로",
      segments: [
        { lat: 37.5885, lng: 127.0305 },
        { lat: 37.5886, lng: 127.0306, distance: 10 },
      ],
      updated_at: "2026-07-01T00:00:00Z",
    }),
  );
}

/** 최근 수정순 첫 페이지를 채움 경로로 채워 `둘째 쪽 경로`(id 900)를 2페이지로 민다 */
function addSecondPageRoute(state: MockState) {
  for (let index = 0; index < 20; index += 1) {
    state.slopes.push(
      slopeRow({
        id: 100 + index,
        name: `채움 경로 ${index}`,
        // 화면 밖에 두어 둘째 쪽 경로의 선을 가리지 않는다
        segments: [
          { lat: 37.58, lng: 127.02 },
          { lat: 37.5801, lng: 127.0201, slope: 2, distance: 14.1 },
        ],
        updated_at: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`,
      }),
    );
  }
  state.slopes.push(slopeRow({ id: 900, name: "둘째 쪽 경로" }));
}

/** 경로 2의 구간에서 slope를 빼 readRoutePoints가 읽지 못하게 한다 */
function breakRoute2(state: MockState) {
  const row = state.slopes.find((slope) => slope.id === 2)!;
  row.segments = [
    { lat: 37.5861, lng: 127.0268 },
    { lat: 37.5862, lng: 127.0269, distance: 12.4 },
  ];
}

const SQUIRREL_ID = "11111111-1111-1111-1111-111111111111";

/** 다른 탭(명소)으로 옮겨 다람쥐길을 열고 이름 칸에 입력해 둔다. 늦게 끝난 요청이 이 화면을 건드리는지 보는 자리다 */
async function typeInLandmarksTab(page: Page) {
  await adminNav(page).getByRole("link", { name: "명소" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  await page
    .getByRole("region", { name: "명소", exact: true })
    .getByRole("button", { name: /다람쥐길/ })
    .click();
  const panel = detailPanel(page, "다람쥐길");
  const name = panel.getByLabel("이름 *");
  await name.fill("입력 중인 명소");
  return { panel, name };
}

/** 이 탭에 머문 채 끝난 요청이 선택·입력을 건드리지 않았는지 */
async function expectLandmarksTabUntouched(
  page: Page,
  tab: Awaited<ReturnType<typeof typeInLandmarksTab>>,
) {
  // 붙잡아 둔 요청이 실제로 끝난 뒤를 본다
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(
    (url) =>
      url.search === `?id=${SQUIRREL_ID}` &&
      url.pathname.endsWith("/landmarks"),
  );
  await expect(tab.panel).toBeVisible();
  await expect(tab.name).toHaveValue("입력 중인 명소");
}

/** 목록 조회(select=*). 편집 지도의 겹침용 조회(select=id,segments)와 가른다 */
function slopeListGet(route: Route) {
  return (
    route.request().method() === "GET" &&
    route.request().url().includes("select=*")
  );
}

test.describe("경사도 작업 화면 — 목록", () => {
  test("검색·정렬로 목록을 좁히고 칩 줄은 없으며 범례는 구간 이름이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addMixedRoutes(state);
    await page.goto("/admin/dashboard/slopes");
    const list = listPanel(page);
    const names = list.getByTestId("admin-list-item-name");

    await expect(
      list.getByText("구간별 경사를 기록한 보행 경로 · 총 4개"),
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveText("4개 표시");
    await expect(list.getByRole("group", { name: "목록 필터" })).toHaveCount(0);
    await expect(
      list.getByRole("list", { name: "범례" }).getByRole("listitem"),
    ).toHaveText(["보도 기준 이내", "완화 범위", "특례 범위", "초과"]);

    const search = list.getByRole("searchbox", { name: "경사도 경로 검색" });
    await expect(search).toHaveAttribute("placeholder", "경로명 검색");
    await search.fill("중앙광장");
    await expect(names).toHaveText(["정문-중앙광장"]);

    await search.fill("없는 경로입니다");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    await list.getByLabel("경사도 경로 정렬").selectOption("name");
    await expect(names).toHaveText([
      "급경사 계단길",
      "깨진 경로",
      "안암병원 정문 경사로",
      "정문-중앙광장",
    ]);
    await list.getByLabel("경사도 경로 정렬").selectOption("updated-asc");
    await expect(names).toHaveText([
      "깨진 경로",
      "정문-중앙광장",
      "안암병원 정문 경사로",
      "급경사 계단길",
    ]);
  });

  test("목록에 GPX 안내·다운로드가 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");

    await expect(listRow(page, "안암병원 정문 경사로")).toBeVisible();
    await expect(page.getByText(/GPX/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다운로드" })).toHaveCount(0);
  });

  test("행에 메타·구간 거리 비례 프로파일 막대를 보이고 배지는 형식 오류 행에만 둔다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addMixedRoutes(state);
    await page.goto("/admin/dashboard/slopes");

    const flat = listRow(page, "정문-중앙광장");
    await expect(flat.locator(".ku-row-badge")).toHaveCount(0);
    await expect(flat.locator(".ku-slope-profile span")).toHaveCSS(
      "background-color",
      "rgb(139, 195, 74)",
    );

    const over = listRow(page, "안암병원 정문 경사로");
    await expect(over.locator(".ku-row-badge")).toHaveCount(0);
    await expect(over).toContainText("1개 구간 · 12.4m · 최대 7.2° · 수정 ");
    const overProfile = over.locator(".ku-slope-profile");
    await expect(overProfile).toHaveAttribute("aria-hidden", "true");
    await expect(overProfile.locator("span")).toHaveCount(1);
    // 7.2°(12.63%)는 기본 구간의 마지막 빨강이다
    await expect(overProfile.locator("span")).toHaveCSS(
      "background-color",
      "rgb(229, 57, 53)",
    );

    const steep = listRow(page, "급경사 계단길");
    await expect(steep).toContainText("2개 구간 · 40.1m · 최대 20.0° · 수정 ");
    const steepProfile = steep.locator(".ku-slope-profile span");
    await expect(steepProfile).toHaveCount(2);
    // 20°는 빨강, 6°(10.51%)는 주황이다
    await expect(steepProfile.nth(0)).toHaveCSS(
      "background-color",
      "rgb(229, 57, 53)",
    );
    await expect(steepProfile.nth(1)).toHaveCSS(
      "background-color",
      "rgb(255, 152, 0)",
    );

    const broken = listRow(page, "깨진 경로");
    await expect(broken.locator(".ku-row-badge")).toHaveText("형식 오류");
    await expect(broken).not.toContainText("구간 ·");
    await expect(broken).toContainText("수정 ");
    await expect(broken.locator(".ku-slope-profile span")).toHaveCount(0);
  });

  test("첫 조회가 실패한 ?id= 링크도 다시 시도가 그 경로의 페이지를 연다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addSecondPageRoute(state);
    let failNext = true;
    await page.route(slopesRequest, async (route) => {
      if (failNext && slopeListGet(route)) {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes?id=900");
    const list = listPanel(page);

    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(
      list.getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 경로")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(detailPanel(page, "둘째 쪽 경로")).toBeVisible();
    await expect(page).toHaveURL(/\?id=900$/);
  });

  test("첫 조회를 기다리다 다른 화면으로 떠나도 늦게 끝난 조회가 그 화면의 선택과 입력을 건드리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseList = () => {};
    const listHeld = new Promise<void>((resolve) => (releaseList = resolve));
    await page.route(slopesRequest, async (route) => {
      if (slopeListGet(route)) await listHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");

    const tab = await typeInLandmarksTab(page);
    releaseList();

    await expectLandmarksTabUntouched(page, tab);
  });

  test("목록을 받지 못하면 패널 안에 오류와 다시 시도를 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failNext = true;
    await page.route(slopesRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    const list = listPanel(page);

    await expect(
      list.getByText("경사도 경로를 불러오지 못했어요."),
    ).toBeVisible();
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(2);
  });
});

test.describe("경사도 작업 화면 — 선택과 지도", () => {
  test("행과 선이 같은 선택이고 URL에 남는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const first = listRow(page, "정문-중앙광장");

    await routeLine(page, 1).first().click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=1$/);
    await expect(detailPanel(page, "정문-중앙광장")).toBeVisible();

    // 데스크톱에서는 같은 항목을 다시 누르면 선택을 푼다
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(detailPanel(page, "정문-중앙광장")).toHaveCount(0);

    const second = listRow(page, "안암병원 정문 경사로");
    await second.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();

    await listPanel(page)
      .getByRole("button", { name: "＋ 경로 그리기" })
      .click();
    await expect(page).toHaveURL(/\?new=1$/);
    await expect(second).toHaveAttribute("aria-pressed", "false");
  });

  test("다른 페이지에 있는 경로의 선을 누르면 목록이 그 페이지로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addSecondPageRoute(state);
    await page.goto("/admin/dashboard/slopes");

    await routeLine(page, 900).first().click();
    await expect(
      listPanel(page).getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 경로")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/\?id=900$/);
  });

  test("선은 구간 색이고 외곽선 위에 그리며, 고르면 나머지가 흐려지고 고른 경로에만 구간 번호가 붙는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const first = routeLine(page, 1);
    const second = routeLine(page, 2);
    const casings = page.locator("path.ku-slope-casing");

    // 픽스처 경로 1(3°)·2(7.2°)의 기본 구간 색(설계 2026-10-19 2.2·2.3)
    await expect(first).toHaveAttribute("stroke", "#8BC34A");
    await expect(second).toHaveAttribute("stroke", "#E53935");
    await expect(first).toHaveAttribute("stroke-linecap", "round");
    await expect(first).toHaveAttribute("stroke-width", "5");
    await expect(first).toHaveAttribute("stroke-opacity", "1");
    await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);
    await expect(casings).toHaveCount(2);
    await expect(casings.first()).toHaveAttribute("stroke-width", "8");
    await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.5");
    await expect(casings.and(page.locator(".leaflet-interactive"))).toHaveCount(
      0,
    );

    await listRow(page, "안암병원 정문 경사로").click();
    await expect(first).toHaveAttribute("stroke-opacity", "0.28");
    await expect(second).toHaveAttribute("stroke-opacity", "1");
    await expect(second).toHaveAttribute("stroke-width", "7");
    const labels = page.locator(".ku-slope-segment-label");
    await expect(labels).toHaveCount(1);
    await expect(labels).toHaveText("1");
    await expect(labels).toHaveCSS("display", "flex");

    // 흐린 경로의 외곽선은 같은 비율로 흐리고, 다시 붙은 고른 경로의 외곽선도 모든 선보다 아래에 있다
    await expect(
      page.locator("path.ku-slope-casing[stroke-width='10']"),
    ).toHaveAttribute("stroke-opacity", "0.5");
    await expect(
      page.locator("path.ku-slope-casing[stroke-width='8']"),
    ).toHaveAttribute("stroke-opacity", /^0\.14/);
    const order = await page
      .locator(".leaflet-overlay-pane path")
      .evaluateAll((paths) =>
        paths.map((path) =>
          path.classList.contains("ku-slope-casing")
            ? "casing"
            : path.classList.contains("ku-slope-route")
              ? "line"
              : "other",
        ),
      );
    expect(order.lastIndexOf("casing")).toBeLessThan(order.indexOf("line"));
  });

  test("목록 조회가 늦게 끝나도 ?id= 링크가 그 경로를 연다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(slopesRequest, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto("/admin/dashboard/slopes?id=2");

    await expect(listRow(page, "안암병원 정문 경사로")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();
    await expect(page).toHaveURL(/\?id=2$/);
  });

  test("없는 ?id=는 열지 않고 URL에서 지우며 알린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=999");

    await expect(
      page.locator(".ku-toast[data-tone='warning']").filter({
        hasText: "경로를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.",
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(page.locator(".ku-detail-panel")).toHaveCount(0);
  });
});

test.describe("경사도 작업 화면 — 보기 패널", () => {
  test("제목·메타·경로 편집과 구간 표를 보인다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();
    const detail = detailPanel(page, "안암병원 정문 경사로");

    await expect(
      detail.getByRole("heading", { name: "안암병원 정문 경사로" }),
    ).toBeVisible();
    await expect(detail).toContainText("1개 구간 · 총 12.4m · 수정 ");
    const table = detail.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText([
      "구간",
      "거리",
      "경사",
      "범례",
    ]);
    const rows = table.locator("tbody").getByRole("row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole("cell")).toHaveText([
      "1",
      "12.4m",
      "7.2° · 12.6%",
      "초과",
    ]);

    await detail.getByRole("button", { name: "경로 편집" }).click();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
  });

  test("인라인 확인을 거쳐 경로를 지우면 행·선이 사라지고 패널이 닫힌다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "정문-중앙광장").click();
    const detail = detailPanel(page, "정문-중앙광장");

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      detail.getByText("삭제한 경사도 경로는 복구할 수 없어요."),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "취소" })
      .click();
    await expect(listRow(page, "정문-중앙광장")).toBeVisible();
    await expect(detail).toBeVisible();

    await confirmDelete(detail);
    await expect(
      page.getByText('"정문-중앙광장" 경로를 삭제했어요'),
    ).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(listRow(page, "정문-중앙광장")).toHaveCount(0);
    await expect(routeLine(page, 1)).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    expect(state.slopes.some((row) => row.id === 1)).toBe(false);
  });

  test("삭제 뒤 목록을 다시 받지 못하면 삭제 성공 토스트가 아니라 불러오기 오류가 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "정문-중앙광장").click();
    const detail = detailPanel(page, "정문-중앙광장");
    let failNext = true;
    await page.route(slopesRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });

    await confirmDelete(detail);

    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "경사도 경로 목록을 새로 불러오지 못했어요" }),
    ).toBeVisible();
    await expect(
      page.getByText('"정문-중앙광장" 경로를 삭제했어요'),
    ).toHaveCount(0);
    expect(state.slopes.some((row) => row.id === 1)).toBe(false);
  });

  test("삭제가 실패하면 반환된 메시지를 오류로 알리고 행을 남긴다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 500,
          headers: { "access-control-allow-origin": "*" },
          contentType: "application/json",
          body: JSON.stringify({ message: "삭제 거부" }),
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "정문-중앙광장").click();
    const detail = detailPanel(page, "정문-중앙광장");

    await confirmDelete(detail);

    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "삭제 실패: 삭제 거부" }),
    ).toBeVisible();
    await expect(listRow(page, "정문-중앙광장")).toBeVisible();
    await expect(detail).toBeVisible();
    expect(state.slopes.some((row) => row.id === 1)).toBe(true);
  });

  test("삭제를 기다리다 다른 화면으로 떠나도 끝난 삭제가 그 화면의 선택과 입력을 건드리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "DELETE") await deleteHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "정문-중앙광장").click();
    const deleting = detailPanel(page, "정문-중앙광장");
    await confirmDelete(deleting);
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    const tab = await typeInLandmarksTab(page);
    releaseDelete();

    await expectLandmarksTabUntouched(page, tab);
  });

  test("삭제를 기다리는 사이 연 다른 경로의 상세는 삭제가 끝나도 남는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "DELETE") await deleteHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "정문-중앙광장").click();
    const deleting = detailPanel(page, "정문-중앙광장");
    await confirmDelete(deleting);
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    await listRow(page, "안암병원 정문 경사로").click();
    const other = detailPanel(page, "안암병원 정문 경사로");
    await expect(other).toBeVisible();
    releaseDelete();

    await expect(
      page.getByText('"정문-중앙광장" 경로를 삭제했어요'),
    ).toBeVisible();
    await expect(listRow(page, "정문-중앙광장")).toHaveCount(0);
    await expect(other).toBeVisible();
    await expect(page).toHaveURL(/\?id=2$/);
  });

  test("저장 형식이 깨진 경로는 형식 오류로 보이고 상세는 안내와 삭제만 둔다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    breakRoute2(state);
    // 편집 주소로 들어와도 첫 조회 뒤 보기로 바꾼다(형식 오류 경로는 편집하지 못한다)
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = detailPanel(page, "안암병원 정문 경사로");

    await expect(page).toHaveURL(/\?id=2$/);
    await expect(
      listRow(page, "안암병원 정문 경사로").locator(".ku-row-badge"),
    ).toHaveText("형식 오류");
    await expect(
      detail.getByText(
        "저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요",
      ),
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "경로 편집" })).toHaveCount(
      0,
    );
    await expect(detail.getByRole("table")).toHaveCount(0);
    await expect(
      detail.getByRole("button", { name: "삭제", exact: true }),
    ).toBeVisible();
    await expect(routeLine(page, 1)).toHaveCount(1);
    await expect(routeLine(page, 2)).toHaveCount(0);

    await confirmDelete(detail);
    await expect(
      page.getByText('"안암병원 정문 경사로" 경로를 삭제했어요'),
    ).toBeVisible();
    expect(state.slopes.some((row) => row.id === 2)).toBe(false);
  });
});

test.describe("경사도 작업 화면 — 옛 편집 주소", () => {
  test("옛 주소는 작업 화면의 편집 상태로 임시 리다이렉트한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const created = await page.request.get("/admin/slopes/new", {
      maxRedirects: 0,
    });
    expect(created.status()).toBe(307);
    expect(created.headers().location).toBe("/admin/dashboard/slopes?new=1");

    const edited = await page.request.get("/admin/slopes/2", {
      maxRedirects: 0,
    });
    expect(edited.status()).toBe(307);
    expect(edited.headers().location).toBe(
      "/admin/dashboard/slopes?id=2&edit=1",
    );
  });

  test("겹친 쿼리로 들어오면 새 경로가 이긴다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2?new=1");

    await expect(newPanel(page)).toBeVisible();
    await expect(editPanel(page, "안암병원 정문 경사로")).toHaveCount(0);
  });

  test("옛 수정 주소로 없는 경로에 가면 열지 않고 URL에서 지우며 알린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/999");

    await expect(
      page.locator(".ku-toast[data-tone='warning']").filter({
        hasText: "경로를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요.",
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(page.locator(".ku-detail-panel")).toHaveCount(0);
  });

  test("옛 수정 주소로 저장 형식이 깨진 경로에 가면 보기로 열어 형식 오류를 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    breakRoute2(state);
    await page.goto("/admin/slopes/2");

    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes\?id=2$/);
    await expect(
      listRow(page, "안암병원 정문 경사로").locator(".ku-row-badge"),
    ).toHaveText("형식 오류");
    await expect(
      detailPanel(page, "안암병원 정문 경사로").getByText(
        "저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요",
      ),
    ).toBeVisible();
  });

  test("비로그인 상태로 수정 화면에 가면 로그인 화면으로 보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: false });
    await page.goto("/admin/slopes/2");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("비로그인 상태로 편집기에 가면 로그인 화면으로 보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: false });
    await page.goto("/admin/slopes/new");
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe("경사도 작업 화면 — 편집 패널", () => {
  test("수기 경로를 열어 값을 고쳐 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();
    await detailPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "경로 편집" })
      .click();
    const detail = editPanel(page, "안암병원 정문 경사로");

    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail.getByLabel("경로 이름")).toHaveValue(
      "안암병원 정문 경사로",
    );
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    // 데스크톱은 삭제를 보기 패널에만 둔다
    await expect(
      detail.getByRole("button", { name: "삭제", exact: true }),
    ).toHaveCount(0);

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByText("경로가 수정되었어요")).toBeVisible();
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();
    const saved = state.slopes.find((row) => row.id === 2);
    const segments = saved!.segments as Array<Record<string, unknown>>;
    expect(segments[1].slope).toBe(9.4);
  });

  test("저장 뒤 목록을 다시 받지 못하면 저장 성공 토스트가 아니라 불러오기 오류가 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();
    await detailPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "경로 편집" })
      .click();
    const detail = editPanel(page, "안암병원 정문 경사로");
    // 편집 지도도 `slope_segments`를 받는다(다른 경로 겹침). 목록 조회(select=*)만 실패시킨다
    let failNext = true;
    await page.route(slopesRequest, async (route) => {
      if (
        failNext &&
        route.request().method() === "GET" &&
        route.request().url().includes("select=*")
      ) {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "경사도 경로 목록을 새로 불러오지 못했어요" }),
    ).toBeVisible();
    await expect(page.getByText("경로가 수정되었어요")).toHaveCount(0);
    const segments = state.slopes.find((row) => row.id === 2)!
      .segments as Array<Record<string, unknown>>;
    expect(segments[1].slope).toBe(9.4);
  });

  test("목록의 경로 그리기로 새 경로 패널을 연다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listPanel(page)
      .getByRole("button", { name: "＋ 경로 그리기" })
      .click();
    const detail = newPanel(page);

    await expect(page).toHaveURL(/\?new=1$/);
    await expect(detail).toBeVisible();
    await expect(detail.getByLabel("경로 이름")).toHaveValue("");
    await expect(
      detail.getByText("지도에서 경로를 그리면 구간이 나타납니다."),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();
  });

  test("저장 상태 알약은 기존 경로를 고치면 저장 안 됨, 새 경로는 새 경로다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");

    await expect(detail.getByText("저장됨", { exact: true })).toBeVisible();
    // 편집 패널의 거리는 지금 꼭짓점으로 다시 잰 값이다(픽스처의 저장 거리와 다르다)
    await expect(detail).toContainText(/1개 구간 · 총 \d+(\.\d)?m/);
    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await expect(detail.getByText("저장 안 됨", { exact: true })).toBeVisible();
    await expect(detail.getByText("저장됨", { exact: true })).toHaveCount(0);

    await page.goto("/admin/dashboard/slopes?new=1");
    await expect(
      newPanel(page).getByText("새 경로", { exact: true }),
    ).toBeVisible();
  });

  test("저장하는 동안에는 다른 경로 선택과 닫기가 잠기고 늦게 끝난 저장 뒤 보기로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let releaseSave = () => {};
    const saveHeld = new Promise<void>((resolve) => (releaseSave = resolve));
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "PATCH") await saveHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      detail.getByRole("button", { name: "저장 중..." }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "상세 닫기" }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "취소", exact: true }),
    ).toBeDisabled();
    const toolButtons = toolbar(page).getByRole("button");
    await expect(toolButtons).not.toHaveCount(0);
    for (const button of await toolButtons.all()) {
      await expect(button).toBeDisabled();
    }

    await listRow(page, "정문-중앙광장").click({ force: true });
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail).toBeVisible();

    releaseSave();
    await expect(page.getByText("경로가 수정되었어요")).toBeVisible();
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();
    const segments = state.slopes.find((row) => row.id === 2)!
      .segments as Array<Record<string, unknown>>;
    expect(segments[1].slope).toBe(9.4);
  });

  test("열어둔 사이 행이 바뀌면 덮어쓰지 않고 알린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    // 다른 곳에서 같은 행을 먼저 저장한 상황.
    const row = state.slopes.find((slope) => slope.id === 2)!;
    row.updated_at = "2026-09-01T00:00:00Z";

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(
      page.getByText(
        "다른 곳에서 바뀌었거나 삭제된 경로예요. 새로고침해서 확인해주세요",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");
    expect((row.segments as Array<Record<string, unknown>>)[1].slope).toBe(7.2);
  });

  test("구간 값을 넣어 저장하면 저장 포맷으로 들어간다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);

    await detail.getByLabel("경로 이름").fill("안암병원 정문 경사로");
    // 값이 비어 있으면 저장이 막힌다.
    await expect(
      detail.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();

    await detail.getByLabel("구간 1 경사도").fill("7.2");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByText("경로가 추가되었어요")).toBeVisible();
    // 픽스처 경로 1·2 다음 id다
    await expect(page).toHaveURL(/\?id=3$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();

    // 픽스처에도 같은 이름의 행이 있어 name으로 find하면 그쪽이 잡힌다.
    // 방금 저장한 행은 POST 처리가 배열 끝에 push하므로 마지막 행이다.
    const saved = state.slopes[state.slopes.length - 1];
    expect(saved.name).toBe("안암병원 정문 경사로");
    expect(saved.gpx_file).toBeNull();

    const segments = saved.segments as Array<Record<string, unknown>>;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
    expect(segments[1].slope).toBe(7.2);
    expect(typeof segments[1].distance).toBe("number");
    expect(segments[1].distance).toBeGreaterThan(0);
  });

  test("완화 한도와 급경사 경고를 표시하되 저장은 막지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    const save = detail.getByRole("button", { name: "저장", exact: true });
    await drawRoute(page, TWO_POINTS);

    await detail.getByLabel("경로 이름").fill("급경사 시험");

    await detail.getByLabel("구간 1 경사도").fill("10");
    await expect(detail.getByText("1/12 완화 한도 초과")).toBeVisible();
    await expect(save).toBeEnabled();

    await detail.getByLabel("구간 1 경사도").fill("45");
    await expect(
      detail.getByText(
        "이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다",
      ),
    ).toBeVisible();
    await expect(save).toBeEnabled();

    await detail.getByLabel("구간 1 경사도").fill("120");
    await expect(save).toBeDisabled();

    // tan(181°)는 1.75%다. % 기준 범위 검사라면 통과해 버린다(2026-10-06 설계 3.2).
    await detail.getByLabel("구간 1 경사도").fill("181");
    await expect(save).toBeDisabled();
  });

  test("저장이 실패해도 그린 경로와 입력값이 남는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 500,
          headers: { "access-control-allow-origin": "*" },
          contentType: "application/json",
          body: JSON.stringify({ message: "서버 오류" }),
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);

    await detail.getByLabel("경로 이름").fill("실패 시험");
    await detail.getByLabel("구간 1 경사도").fill("7.2");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByText(/저장 실패/)).toBeVisible();
    await expect(page).toHaveURL(/\?new=1$/);
    await expect(detail.getByLabel("경로 이름")).toHaveValue("실패 시험");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
  });

  test("수정 화면에서 값을 고친 채 취소하면 경고하고, 경고를 취소하면 값이 남는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "취소", exact: true }).click();
    await expect(
      page.getByText("저장하지 않은 변경사항이 있어요"),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");
  });

  test("새 경로에 값을 입력한 채 취소하면 경고한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);
    await detail.getByLabel("경로 이름").fill("작성 중");

    await detail.getByRole("button", { name: "취소", exact: true }).click();
    await expect(
      page.getByText("저장하지 않은 변경사항이 있어요"),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(detail.getByLabel("경로 이름")).toHaveValue("작성 중");
  });

  test("기존 수기 경로를 아무것도 고치지 않고 취소하면 경고 없이 보기로 간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");

    // 지도가 좌표를 다시 읽어 초안에 새 배열을 써넣는 것까지 기다린다.
    await expect(previewLines(page).first()).toBeVisible();

    await editPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "취소", exact: true })
      .click();

    await expect(page.getByText("저장하지 않은 변경사항이 있어요")).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();
  });

  test("편집기에서 저장한 경로가 공개 지도에 그대로 그려진다", async ({
    page,
  }) => {
    // 이 설계 전체가 "toStoredSegments의 출력을 SlopeLayer가 그대로 읽는다"에
    // 걸려 있다. 픽스처가 아니라 실제 저장 payload로 끝단을 확인한다.
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, [
      { x: 540, y: 220 },
      { x: 600, y: 250 },
    ]);

    await detail.getByLabel("경로 이름").fill("끝단 시험 경사로");
    await detail.getByLabel("구간 1 경사도").fill("4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\?id=3$/);

    await page.goto("/");
    await page.getByRole("checkbox", { name: "경사도" }).check();

    // 4°(6.99%)는 기본 구간의 둘째 노랑이다. 픽스처의 두 행(3°, 7.2°)은 다른 구간이라 방금 저장한 경로만 잡힌다
    const saved = page.locator('path[stroke="#FFD600"]').first();
    await expect(saved).toBeVisible();

    await saved.dispatchEvent("click");
    const popup = page.locator(".leaflet-popup");
    await expect(popup).toContainText("끝단 시험 경사로");
    await expect(popup).toContainText("7.0%");
    await expect(popup).toContainText("4.0°");
  });

  test("퍼센트로 입력하면 도로 바꿔 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);

    await detail.getByLabel("경로 이름").fill("퍼센트 입력 시험");
    await detail
      .getByRole("group", { name: "경사 단위" })
      .getByRole("button", { name: "퍼센트(%)" })
      .click();
    await detail.getByLabel("구간 1 경사도").fill("12.5");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\?id=3$/);

    const saved = state.slopes[state.slopes.length - 1];
    const segments = saved.segments as Array<Record<string, unknown>>;
    // atan(0.125) = 7.12501634890…°. 반올림 없이 저장한다(2026-10-06 설계 2.2).
    expect(segments[1].slope as number).toBeCloseTo(7.1250163489, 9);
  });

  test("다른 단위 환산값을 보여주고 단위를 바꿔도 값이 유지된다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    const units = detail.getByRole("group", { name: "경사 단위" });
    await drawRoute(page, TWO_POINTS);

    await expect(units.getByRole("button", { name: "도(°)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const input = detail.getByLabel("구간 1 경사도");
    await input.fill("10");
    await expect(detail.getByText("= 17.6%")).toBeVisible();

    await units.getByRole("button", { name: "퍼센트(%)" }).click();
    await expect(
      units.getByRole("button", { name: "퍼센트(%)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveValue("17.63");
    await expect(detail.getByText("= 10.0°")).toBeVisible();

    await units.getByRole("button", { name: "도(°)" }).click();
    await expect(input).toHaveValue("10");
  });

  test("고른 입력 단위를 기억한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    await newPanel(page).getByRole("button", { name: "퍼센트(%)" }).click();

    await page.reload();
    await expect(
      newPanel(page).getByRole("button", { name: "퍼센트(%)" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("범위 밖 각도는 미리보기에 그리지 않고 단위를 바꿔도 입력을 그대로 둔다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);

    const input = detail.getByLabel("구간 1 경사도");
    await input.fill("181");
    await expect(previewLines(page)).toHaveCount(0);

    await detail.getByRole("button", { name: "퍼센트(%)" }).click();
    await expect(input).toHaveValue("181");
    await expect(
      detail.getByRole("button", { name: "저장", exact: true }),
    ).toBeDisabled();
  });

  test("편집기에 주변 건물을 깔고 스냅은 끈 채 시작한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");

    await expect(
      page.locator(".leaflet-tooltip.bldg-label", { hasText: "중앙도서관" }),
    ).toBeVisible();
    await expect(tool(page, "건물에 붙이기")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("편집 지도도 주변 건물 이름표를 박스 없이 그리고, 점 데이터인 역은 마커 없이 이름만 그린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings.push(stationBuildingRow(90, "안암역", [127.0316, 37.5889]));
    await page.goto("/admin/dashboard/slopes?new=1");

    const label = page.locator(".leaflet-tooltip.bldg-label", {
      hasText: "중앙도서관",
    });
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(label).toHaveCSS("box-shadow", "none");
    await expect(
      page.locator(".leaflet-tooltip.bldg-label", { hasText: "안암역" }),
    ).toBeVisible();
    await expect(page.locator("img.leaflet-marker-icon")).toHaveCount(0);
  });

  test("지우고 다시 그리기로 경로를 비운다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();

    // 실측값을 클릭 한 번에 날리지 않는다. 취소하면 그대로 남는다.
    await tool(page, "지우기").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();

    await tool(page, "지우기").click();
    await expect(
      page.getByText("그린 경로를 지우고 다시 그릴까요?"),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();
    await expect(detail.getByLabel("구간 1 경사도")).toHaveCount(0);
    // 지우면 그리기가 다시 켜져 그리는 중 도구가 보인다
    await expect(tool(page, "끝내기")).toBeVisible();
    await expect(tool(page, "그리기")).toHaveCount(0);
  });

  test("수정 화면에서 지우고 다시 그리기를 누르면 선과 입력값이 함께 비워지고 다시 그릴 수 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");

    await expect(previewLines(page).first()).toBeVisible();
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await tool(page, "지우기").click();
    await expect(
      page.getByText("그린 경로를 지우고 다시 그릴까요?"),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();

    await expect(detail.getByLabel("구간 1 경사도")).toHaveCount(0);
    await expect(previewLines(page)).toHaveCount(0);
    await expect(tool(page, "끝내기")).toBeVisible();

    // 지우면 그리기가 다시 켜져 있다
    const map = editMap(page);
    for (const position of TWO_POINTS) await map.click({ position });
    await map.click({ position: TWO_POINTS[1] });

    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("");
  });

  test("구간 카드 번호 원은 구간 색이고 글자색은 대비가 높은 쪽이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addMixedRoutes(state);
    await page.goto("/admin/dashboard/slopes?id=3&edit=1");
    const indexes = editPanel(page, "급경사 계단길").locator(
      ".ku-slope-card-index",
    );
    await expect(indexes).toHaveCount(2);
    // 20°는 빨강 위 흰 글자, 6°는 주황 위 어두운 글자
    await expect(indexes.nth(0)).toHaveCSS(
      "background-color",
      "rgb(229, 57, 53)",
    );
    await expect(indexes.nth(0)).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(indexes.nth(1)).toHaveCSS(
      "background-color",
      "rgb(255, 152, 0)",
    );
    await expect(indexes.nth(1)).toHaveCSS("color", "rgb(28, 25, 23)");
  });
});

test.describe("경사도 작업 화면 — 편집 지도", () => {
  test("경로 편집으로 지도를 바꿔 끼워도 화면이 그대로이고 취소하면 보기 지도로 돌아온다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();
    const viewCenter = await settledCenter(routeLine(page, 2));

    await detailPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "경로 편집" })
      .click();
    await expect(editMap(page)).toBeVisible();
    await expect(routeLine(page, 2)).toHaveCount(0);
    const editCenter = await settledCenter(previewLines(page).first());
    expectNear(editCenter, viewCenter, 2);

    await editPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "취소", exact: true })
      .click();
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(editMap(page)).toHaveCount(0);
    const backCenter = await settledCenter(routeLine(page, 2));
    expectNear(backCenter, editCenter, 2);
  });

  test("경로로 옮긴 뒤 손으로 끈 화면은 경로 편집과 취소로 바꿔 끼워도 그대로 이어받는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();
    const focused = await settledCenter(routeLine(page, 2));

    // 선과 패널을 피한 빈 곳을 끈다
    await page.mouse.move(700, 560);
    await page.mouse.down();
    await page.mouse.move(620, 500, { steps: 10 });
    await page.mouse.up();
    const dragged = await settledCenter(routeLine(page, 2));
    expect(Math.abs(dragged.x - focused.x)).toBeGreaterThan(40);

    await detailPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "경로 편집" })
      .click();
    expectNear(await settledCenter(previewLines(page).first()), dragged, 2);

    await editPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "취소", exact: true })
      .click();
    await expect(page).toHaveURL(/\?id=2$/);
    expectNear(await settledCenter(routeLine(page, 2)), dragged, 2);
  });

  test("편집 주소로 바로 들어오면 경로를 패널 밖 지도 영역에 맞춰 연다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");
    await expect(detail).toBeVisible();

    const line = previewLines(page).first();
    await settledCenter(line);
    const lineBox = (await line.boundingBox())!;
    const listBox = (await listPanel(page).boundingBox())!;
    const detailBox = (await detail.boundingBox())!;
    expect(lineBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
    expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(detailBox.x);
  });

  test("편집하다 다른 경로를 고르면 보기 지도가 그 경로로 옮긴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    await expect(previewLines(page).first()).toBeVisible();

    await listRow(page, "정문-중앙광장").click();
    const detail = detailPanel(page, "정문-중앙광장");
    await expect(detail).toBeVisible();
    const line = routeLine(page, 1);
    await settledCenter(line);
    const lineBox = (await line.boundingBox())!;
    const listBox = (await listPanel(page).boundingBox())!;
    const detailBox = (await detail.boundingBox())!;
    expect(lineBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
    expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(detailBox.x);
  });

  test("행을 고른 뒤 지도가 경로로 옮기는 중에 경로 편집을 눌러도 편집 지도는 그 경로를 패널 사이에 보인다", async ({
    page,
  }) => {
    const leafletErrors = collectLeafletErrors(page);
    await installMockBackend(page, { authenticated: true });
    await clickWhenMapStartsMoving(page, {
      map: ".leaflet-container:not(.ku-slope-route-map)",
      panel: "안암병원 정문 경사로",
      button: "경로 편집",
    });
    await page.goto("/admin/dashboard/slopes");
    await listRow(page, "안암병원 정문 경사로").click();

    const detail = editPanel(page, "안암병원 정문 경사로");
    await expect(detail).toBeVisible();
    const line = previewLines(page).first();
    await expect
      .poll(() => placementBetweenPanels(page, line, detail))
      .toBe("사이");
    await settledCenter(line);
    expect(await placementBetweenPanels(page, line, detail)).toBe("사이");
    expect(leafletErrors).toEqual([]);
  });

  test("편집 주소로 들어와 지도가 경로로 옮기는 중에 취소해도 보기 지도는 경로를 같은 자리에 보인다", async ({
    page,
  }) => {
    const leafletErrors = collectLeafletErrors(page);
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2");
    const viewCenter = await settledCenter(routeLine(page, 2));

    await clickWhenMapStartsMoving(page, {
      map: ".ku-slope-route-map",
      panel: "안암병원 정문 경사로 편집",
      button: "취소",
    });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    await expect(page).toHaveURL(/\?id=2$/);

    const detail = detailPanel(page, "안암병원 정문 경사로");
    const line = routeLine(page, 2);
    await expect
      .poll(() => placementBetweenPanels(page, line, detail))
      .toBe("사이");
    expectNear(await settledCenter(line), viewCenter, 2);
    expect(leafletErrors).toEqual([]);
  });

  test("수정 화면을 열면 불러온 경사값으로 구간 색 미리보기 선을 외곽선 위에 그린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");

    // 7.2°(12.63%)는 기본 구간의 마지막 빨강이다
    await expect(previewLines(page).first()).toHaveAttribute(
      "stroke",
      "#E53935",
    );
    const casing = page.locator(
      ".leaflet-pane.slope-preview-pane path.ku-slope-casing",
    );
    await expect(casing).toHaveCount(1);
    await expect(casing).toHaveAttribute("stroke-width", "12");
  });

  test("입력한 경사도에 따라 미리보기 선이 구간 색으로 바뀐다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);
    const preview = previewLines(page).first();
    const input = detail.getByLabel("구간 1 경사도");

    // 1°·4°(6.99%)·6°(10.51%)·10°가 기본 네 구간에 하나씩 든다
    for (const [value, color] of [
      ["1", "#8BC34A"],
      ["4", "#FFD600"],
      ["6", "#FF9800"],
      ["10", "#E53935"],
    ] as const) {
      await input.fill(value);
      await expect(preview).toHaveAttribute("stroke", color);
    }
  });

  test("꼭짓점을 드래그하면 미리보기 선과 구간 카드의 거리가 새 좌표를 따라간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);

    await detail.getByLabel("구간 1 경사도").fill("1");
    const preview = previewLines(page).first();
    const before = await preview.getAttribute("d");
    const distance = detail.locator(".ku-slope-card-meta").first();
    const distanceBefore = await distance.textContent();

    const mapBox = (await editMap(page).boundingBox())!;
    const marker = page.locator(".marker-icon").first();
    const markerBox = (await marker.boundingBox())!;
    await page.mouse.move(
      markerBox.x + markerBox.width / 2,
      markerBox.y + markerBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(mapBox.x + 600, mapBox.y + 400, { steps: 10 });
    await page.mouse.up();

    await expect(preview).not.toHaveAttribute("d", before ?? "");
    // 드래그는 좌표만 바꾼다. 거리는 새 좌표로 다시 계산되지만 입력한 경사값은 남는다(2026-08-30 설계 6.2).
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("1");
    await expect(distance).not.toHaveText(distanceBefore ?? "");
  });

  test("편집기 지도는 19까지 확대된다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    // 받은 위치로 줌 18에 연 뒤에 누른다
    await expect(blueDot(page)).toHaveCount(1);

    const zoomIn = editMap(page).locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toHaveAttribute("title", "확대");
    await expect(zoomIn).not.toHaveClass(/leaflet-disabled/);
    await zoomIn.click();
    await expect(zoomIn).toHaveClass(/leaflet-disabled/);
  });

  test("선을 끝내면 구간마다 번호표가 뜬다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");

    const map = editMap(page);
    await tool(page, "그리기").click();
    for (const position of THREE_POINTS) await map.click({ position });
    await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);
    await tool(page, "끝내기").click();

    const labels = page.locator(".ku-slope-segment-label");
    await expect(labels).toHaveCount(2);
    await expect(labels.nth(0)).toHaveText("1");
    await expect(labels.nth(1)).toHaveText("2");
  });

  test("폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, THREE_POINTS);

    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 2 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 3 경사도")).toHaveCount(0);

    // 꼭짓점 삽입용 중간점 핸들이 없어야 한다.
    await expect(page.locator(".marker-icon-middle")).toHaveCount(0);

    // 꼭짓점을 오른쪽 클릭해도 지워지지 않아야 한다.
    await page.locator(".marker-icon").first().click({ button: "right" });
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 2 경사도")).toBeVisible();

    // 선을 하나 그리면 그리기 버튼이 잠긴다.
    await expect(tool(page, "그리기")).toBeDisabled();
  });

  test("그리는 동안 도구 바는 끝내기·마지막 꼭지점 제거·그리기 취소만 보이고 geoman 툴바는 없다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    await expect(page.locator(".leaflet-pm-toolbar")).toHaveCount(0);

    await tool(page, "그리기").click();
    const buttons = toolbar(page).getByRole("button");
    await expect(buttons).toHaveCount(3);
    for (const [index, name] of [
      "끝내기",
      "마지막 꼭지점 제거",
      "그리기 취소",
    ].entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(name);
    }
    // 보이는 글자는 그대로 두고 패널의 취소와 접근 이름만 가른다
    await expect(buttons.nth(2)).toHaveText("✕취소");
    await expect(page.locator(".leaflet-pm-toolbar")).toHaveCount(0);
  });

  for (const width of [1280, 1144, 1143, 1024, 964, 963, 800, 768]) {
    test(`${width}px 폭에서 도구 바는 패널·줌 버튼과 겹치지 않고 버튼이 눌린다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await installMockBackend(page, { authenticated: true });
      await page.goto("/admin/dashboard/slopes?id=2&edit=1");
      await expect(toolbar(page)).toBeVisible();

      async function expectClear() {
        const bar = (await toolbar(page).boundingBox())!;
        const others = [
          detailPanel(page, "안암병원 정문 경사로 편집"),
          editMap(page).locator(".leaflet-control-zoom"),
        ];
        // 좁은 폭에서는 목록이 visibility로 숨어 있어 자리만 차지하고 가리지 않는다
        if (width >= 964) others.push(listPanel(page));
        for (const other of others) {
          const box = (await other.boundingBox())!;
          const apart =
            bar.x + bar.width <= box.x ||
            box.x + box.width <= bar.x ||
            bar.y + bar.height <= box.y ||
            box.y + box.height <= bar.y;
          expect(apart).toBe(true);
        }
        for (const button of await toolbar(page).getByRole("button").all()) {
          const hit = await button.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return element.contains(top);
          });
          expect(hit).toBe(true);
        }
      }

      await expectClear();
      await tool(page, "통째로 옮기기").click();
      await tool(page, "꼭짓점 편집").click();
      await page.getByRole("button", { name: "지우기" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "지우고 다시 그리기", exact: true })
        .click();
      await expect(tool(page, "끝내기")).toBeVisible();
      await expectClear();
    });
  }

  test("마지막 꼭지점 제거는 찍은 점을 하나 빼고 그리기 취소는 선 없이 그리기를 끝낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    const map = editMap(page);

    await tool(page, "그리기").click();
    for (const position of THREE_POINTS) await map.click({ position });
    await tool(page, "마지막 꼭지점 제거").click();
    await tool(page, "끝내기").click();
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 2 경사도")).toHaveCount(0);

    await tool(page, "지우기").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();
    await tool(page, "그리기 취소").click();
    await expect(tool(page, "그리기")).toBeEnabled();
    await expect(tool(page, "끝내기")).toHaveCount(0);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveCount(0);
  });

  test("꼭짓점 편집과 통째로 옮기기는 서로 하나만 눌리고 옮겨도 구간 값과 거리는 그대로다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, "안암병원 정문 경사로");
    const vertexTool = tool(page, "꼭짓점 편집");
    const dragTool = tool(page, "통째로 옮기기");
    await expect(vertexTool).toHaveAttribute("aria-pressed", "true");
    await expect(dragTool).toHaveAttribute("aria-pressed", "false");

    await dragTool.click();
    await expect(vertexTool).toHaveAttribute("aria-pressed", "false");
    await expect(dragTool).toHaveAttribute("aria-pressed", "true");

    const slope = detail.getByLabel("구간 1 경사도");
    const distance = detail.locator(".ku-slope-card-meta").first();
    const distanceBefore = await distance.textContent();
    const line = page.locator(
      ".leaflet-overlay-pane path.leaflet-pm-draggable",
    );
    const preview = previewLines(page).first();
    const center = await settledCenter(line);
    const before = await preview.getAttribute("d");
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 40, { steps: 10 });
    await page.mouse.up();

    await expect(preview).not.toHaveAttribute("d", before ?? "");
    await expect(slope).toHaveValue("7.2");
    await expect(distance).toHaveText(distanceBefore ?? "");

    await vertexTool.click();
    await expect(vertexTool).toHaveAttribute("aria-pressed", "true");
    await expect(dragTool).toHaveAttribute("aria-pressed", "false");
  });

  test("새 경로는 받은 위치를 가운데 두고 파란 점을 찍는다", async ({
    page,
  }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
    });
    await page.goto("/admin/dashboard/slopes?new=1");

    await expect(blueDot(page)).toHaveCount(1);
    const offset = await dotOffsetFromCenter(page);
    expect(Math.abs(offset.x)).toBeLessThan(3);
    expect(Math.abs(offset.y)).toBeLessThan(3);
  });

  test("위치 권한이 없으면 점 없이 기본 위치로 연다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: null,
    });
    await page.goto("/admin/dashboard/slopes?new=1");
    await expect(editMap(page)).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });

  test("캠퍼스 밖 위치는 쓰지 않는다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.5, longitude: 127.0 },
    });
    await page.goto("/admin/dashboard/slopes?new=1");
    await expect(editMap(page)).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });

  test("위치 응답 전에 지도를 끌면 화면을 옮기지 않는다", async ({ page }) => {
    // 지연이 짧으면 드래그가 응답보다 늦게 끝나도 통과해 버려 결함을 못 잡는다.
    // 3초면 드래그가 먼저 끝나고, 응답은 expect 기본 대기(5초) 안에 온다.
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
      geolocationDelayMs: 3000,
    });
    await page.goto("/admin/dashboard/slopes?new=1");

    const box = (await editMap(page).boundingBox())!;
    // 목록 패널과 상세 패널 사이의 지도를 끈다
    await page.mouse.move(box.x + 560, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 700, box.y + 300, { steps: 5 });
    await page.mouse.up();

    await expect(blueDot(page)).toHaveCount(1);
    const offset = await dotOffsetFromCenter(page);
    expect(Math.abs(offset.x)).toBeGreaterThan(30);
  });

  test("기존 경로 수정은 위치가 아니라 선에 맞춰 연다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
    });
    await page.goto("/admin/dashboard/slopes?id=2");
    await detailPanel(page, "안암병원 정문 경사로")
      .getByRole("button", { name: "경로 편집" })
      .click();

    await expect(previewLines(page).first()).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });

  test("새 경로 편집기에 다른 경로를 구간 색과 외곽선으로 깔고 클릭을 가로채지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");

    const pane = page.locator(".leaflet-slopeOthers-pane");
    const others = pane.locator("path:not(.ku-slope-casing)");
    await expect(others).toHaveCount(2);
    // 픽스처 경로 1(3°)·2(7.2°)의 기본 구간 색
    await expect(others.and(page.locator('[stroke="#8BC34A"]'))).toHaveCount(1);
    await expect(others.and(page.locator('[stroke="#E53935"]'))).toHaveCount(1);
    await expect(pane.locator("path.ku-slope-casing")).toHaveCount(2);
    await expect(pane.locator("path.leaflet-interactive")).toHaveCount(0);
  });

  test("수정 화면은 편집 중인 경로를 빼고 깔며 다른 경로는 드래그 모드에 잡히지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");

    const others = page.locator(
      ".leaflet-slopeOthers-pane path:not(.ku-slope-casing)",
    );
    await expect(others).toHaveCount(1);
    await expect(others).toHaveAttribute("stroke", "#8BC34A");

    await tool(page, "통째로 옮기기").click();
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-pm-draggable"),
    ).toHaveCount(1);
    await expect(others).not.toHaveClass(/leaflet-pm-draggable/);
  });

  for (const snapOn of [false, true]) {
    test(`스냅이 ${snapOn ? "켜" : "꺼"}져 있으면 건물 외곽선 근처에서 꼭짓점이 ${snapOn ? "외곽선에 붙는다" : "찍은 자리에 놓인다"}`, async ({
      page,
    }) => {
      await installMockBackend(page, { authenticated: true });
      await page.goto("/admin/dashboard/slopes?new=1");
      const building = page
        .locator(".leaflet-slopeBuildings-pane path")
        .first();
      await expect(building).toBeVisible();
      if (snapOn) {
        await tool(page, "건물에 붙이기").click();
        await expect(tool(page, "건물에 붙이기")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }

      const box = (await building.boundingBox())!;
      const target = { x: box.x - 8, y: box.y + box.height / 2 };
      // 다가오는 자리까지 목록 패널에 가리지 않는 건물이어야 한다
      const listBox = (await listPanel(page).boundingBox())!;
      expect(target.x - 30).toBeGreaterThan(listBox.x + listBox.width);
      const mapBox = (await editMap(page).boundingBox())!;
      await tool(page, "그리기").click();
      await page.mouse.move(target.x - 30, target.y);
      await page.mouse.move(target.x, target.y, { steps: 5 });
      await page.mouse.click(target.x, target.y);
      const second = { x: mapBox.x + 680, y: mapBox.y + 220 };
      await page.mouse.move(second.x, second.y, { steps: 5 });
      await page.mouse.click(second.x, second.y);
      await page.mouse.click(second.x, second.y);

      const vertex = (await page
        .locator(".marker-icon")
        .first()
        .boundingBox())!;
      const centerX = vertex.x + vertex.width / 2;
      expect(Math.abs(centerX - (snapOn ? box.x : target.x))).toBeLessThan(3);
    });
  }
});

test.describe("경사도 작업 화면 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const ROUTE_2 = "안암병원 정문 경사로";

  function mapBar(page: Page) {
    return page.getByRole("region", { name: "지도 편집", exact: true });
  }

  /** 바텀시트를 펼쳐 행을 누른다 */
  async function openFromSheet(page: Page, name: string) {
    await listPanel(page).getByRole("button", { name: "목록 펼치기" }).click();
    await listRow(page, name).click();
  }

  type Box = Point & { width: number; height: number };

  function expectInside(inner: Box, outer: Box) {
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  }

  /** 지도를 옮긴 뒤 선이 멈추면 그 상자를 잰다 */
  async function settledBox(locator: Locator) {
    await settledCenter(locator);
    return (await locator.boundingBox())!;
  }

  // 전체 지도에서 선이 위쪽 도구 바와 아래 확인 바 사이에 다 보이는지
  async function linePlacement(page: Page) {
    const [lineBox, toolBox, barBox] = await Promise.all([
      previewLines(page).first().boundingBox(),
      toolbar(page).boundingBox(),
      mapBar(page).boundingBox(),
    ]);
    if (!lineBox || !toolBox || !barBox) return "잴 수 없음";
    const toolBottom = toolBox.y + toolBox.height;
    const lineBottom = lineBox.y + lineBox.height;
    return lineBox.y >= toolBottom && lineBottom <= barBox.y
      ? "사이"
      : `벗어남 (선 ${Math.round(lineBox.y)}~${Math.round(lineBottom)}, 도구 바 아래 ${Math.round(toolBottom)}, 확인 바 위 ${Math.round(barBox.y)})`;
  }

  test("바텀시트에서 행을 누르면 바로 편집 패널이 열리고 위쪽 230px 띠로 경로 선이 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const sheet = listPanel(page);
    await expect(
      page.getByRole("searchbox", { name: "경사도 경로 검색" }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "목록 필터" })).toHaveCount(0);

    await sheet.getByRole("button", { name: "목록 펼치기" }).click();
    const row = listRow(page, ROUTE_2);
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    await row.click();

    // 모바일은 보기와 편집을 합친다
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    const detail = editPanel(page, ROUTE_2);
    await expect(detail).toBeVisible();
    await expect(sheet).toBeHidden();
    const strip = (await detail
      .locator(".ku-detail-panel-strip")
      .boundingBox())!;
    expect(strip.height).toBe(230);
    expectInside(await settledBox(previewLines(page).first()), strip);
    await expect(toolbar(page)).toHaveCount(0);
  });

  test("띠에서 꼭짓점을 끌면 구간 카드의 거리가 바뀐다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await openFromSheet(page, ROUTE_2);
    const detail = editPanel(page, ROUTE_2);
    const strip = (await detail
      .locator(".ku-detail-panel-strip")
      .boundingBox())!;
    await settledCenter(previewLines(page).first());
    const distance = detail.locator(".ku-slope-card-meta").first();
    const distanceBefore = await distance.textContent();

    const marker = page.locator(".marker-icon").first();
    const markerBox = (await marker.boundingBox())!;
    expectInside(markerBox, strip);
    const start = {
      x: markerBox.x + markerBox.width / 2,
      y: markerBox.y + markerBox.height / 2,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 10 });
    await page.mouse.up();

    await expect(distance).not.toHaveText(distanceBefore ?? "");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    await expect(detail.getByText("저장 안 됨", { exact: true })).toBeVisible();
  });

  test("지도에서 경로 고치기로 상세를 접고 통째로 옮긴 뒤 완료하면 상세가 다시 보이고 값이 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    // 위아래로 긴 경로라야 들어갈 때 맞춘 화면이 위쪽 도구 바에 닿는지 드러난다
    const row = state.slopes.find((slope) => slope.id === 2)!;
    row.segments = [
      { lat: 37.5861, lng: 127.0268 },
      { lat: 37.5885, lng: 127.0269, slope: 7.2, distance: 266.9 },
    ];
    await page.goto("/admin/dashboard/slopes");
    await openFromSheet(page, ROUTE_2);
    const detail = editPanel(page, ROUTE_2);
    await settledCenter(previewLines(page).first());
    await detail.getByLabel("경로 이름").fill("모바일에서 고친 경로");

    const open = detail.getByRole("button", { name: "지도에서 경로 고치기" });
    await open.click();
    await expect(detail).toBeHidden();
    const bar = mapBar(page);
    await expect(bar).toBeVisible();
    await expect(bar).toBeFocused();
    await expect(bar).toContainText("도구 바로 그리고 꼭짓점을 끌어 고쳐요");
    await expect.poll(() => linePlacement(page)).toBe("사이");
    await settledCenter(previewLines(page).first());
    expect(await linePlacement(page)).toBe("사이");

    const mapBox = (await page.locator(".ku-map-workspace-map").boundingBox())!;
    const toolBox = (await toolbar(page).boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(Math.round(toolBox.y - mapBox.y)).toBe(12);
    expect(toolBox.x).toBeGreaterThanOrEqual(mapBox.x + 12);
    expect(toolBox.x + toolBox.width).toBeLessThanOrEqual(
      mapBox.x + mapBox.width - 12,
    );
    expect(toolBox.y + toolBox.height).toBeLessThanOrEqual(barBox.y);

    await tool(page, "통째로 옮기기").click();
    const line = page.locator(
      ".leaflet-overlay-pane path.leaflet-pm-draggable",
    );
    const preview = previewLines(page).first();
    const before = await preview.getAttribute("d");
    const center = await settledCenter(line);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 40, { steps: 10 });
    await page.mouse.up();
    await expect(preview).not.toHaveAttribute("d", before ?? "");

    await bar.getByRole("button", { name: "완료" }).click();
    await expect(bar).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(open).toBeFocused();
    await expect(toolbar(page)).toHaveCount(0);
    // 띠에는 도구 바가 없어 지금 모드가 보이지 않는다. 꼭짓점 편집으로 돌아와 있어야 띠에서 꼭짓점을 끈다
    await expect(page.locator(".marker-icon")).toHaveCount(2);
    await expect(line).toHaveCount(0);
    await expect(detail.getByLabel("경로 이름")).toHaveValue(
      "모바일에서 고친 경로",
    );
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    await expect(detail.getByText("저장 안 됨", { exact: true })).toBeVisible();
    // 나오면 옮긴 경로를 띠에 맞춘다
    const strip = (await detail
      .locator(".ku-detail-panel-strip")
      .boundingBox())!;
    expectInside(await settledBox(preview), strip);

    // 지도 편집은 바로 초안에 들어 있다. 패널의 취소가 초안 전체를 버린다
    await detail.getByRole("button", { name: "취소", exact: true }).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(listPanel(page)).toBeVisible();
    const stored = state.slopes.find((row) => row.id === 2)!;
    expect(stored.name).toBe(ROUTE_2);
    expect(
      (stored.segments as Array<Record<string, unknown>>)[1],
    ).toMatchObject({ lat: 37.5885, lng: 127.0269 });
  });

  test("데스크톱에서 통째로 옮기기를 고른 채 모바일 폭이 되어도 띠는 꼭짓점 편집이다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    await tool(page, "통째로 옮기기").click();
    await expect(page.locator(".marker-icon")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toolbar(page)).toHaveCount(0);
    await expect(page.locator(".marker-icon")).toHaveCount(2);
    await expect(
      page.locator(".leaflet-overlay-pane path.leaflet-pm-draggable"),
    ).toHaveCount(0);
  });

  test("새 경로는 지도에서 경로 그리기로 그리고 완료하면 구간 카드가 생긴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await listPanel(page).getByRole("button", { name: "＋ 추가" }).click();
    const detail = newPanel(page);
    await expect(
      detail.getByRole("button", { name: "지도에서 경로 고치기" }),
    ).toHaveCount(0);

    await detail.getByRole("button", { name: "지도에서 경로 그리기" }).click();
    await expect(detail).toBeHidden();
    const bar = mapBar(page);
    const done = bar.getByRole("button", { name: "완료" });
    await tool(page, "그리기").click();
    // 그리는 동안 나가면 띠에서 그리기를 끝낼 도구가 없다
    await expect(done).toBeDisabled();
    for (const position of [
      { x: 120, y: 280 },
      { x: 260, y: 400 },
    ]) {
      await editMap(page).click({ position });
    }
    await tool(page, "끝내기").click();
    await done.click();

    await expect(detail).toBeVisible();
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("구간 2 경사도")).toHaveCount(0);
    await expect(
      detail.getByRole("button", { name: "지도에서 경로 고치기" }),
    ).toBeVisible();

    await detail.getByLabel("경로 이름").fill("모바일 새 경로");
    await detail.getByLabel("구간 1 경사도").fill("3");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("경로가 추가되었어요")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(listRow(page, "모바일 새 경로")).toBeAttached();
  });

  test("모바일 편집 패널의 목록으로와 저장은 목록으로 돌아간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await openFromSheet(page, ROUTE_2);
    const detail = editPanel(page, ROUTE_2);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(listPanel(page)).toBeVisible();

    // 바텀시트는 펼친 채 남아 있다
    await listRow(page, ROUTE_2).click();
    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("경로가 수정되었어요")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(listPanel(page)).toBeVisible();
    const segments = state.slopes.find((row) => row.id === 2)!
      .segments as Array<Record<string, unknown>>;
    expect(segments[1].slope).toBe(9.4);
  });

  test("기존 경로의 편집 패널은 본문 맨 아래에 삭제를 두고 하단 취소·저장은 50px이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, ROUTE_2);
    const body = detail.locator(".ku-detail-panel-body");
    await expect(
      body.getByRole("button", { name: "삭제", exact: true }),
    ).toBeVisible();
    expect(
      await body.evaluate((element) => element.lastElementChild?.textContent),
    ).toBe("삭제");
    for (const name of ["취소", "저장"]) {
      const box = await detail
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box!.height, name).toBe(50);
    }

    await confirmDelete(detail);
    await expect(
      page.getByText(`"${ROUTE_2}" 경로를 삭제했어요`),
    ).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    expect(state.slopes.some((row) => row.id === 2)).toBe(false);

    await listPanel(page).getByRole("button", { name: "＋ 추가" }).click();
    await expect(newPanel(page)).toBeVisible();
    await expect(
      newPanel(page).getByRole("button", { name: "삭제", exact: true }),
    ).toHaveCount(0);
  });

  test("삭제를 기다리는 사이 목록으로 돌아가 연 다른 경로의 상세는 삭제가 끝나도 남는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(slopesRequest, async (route) => {
      if (route.request().method() === "DELETE") await deleteHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/slopes?id=1&edit=1");
    const deleting = editPanel(page, "정문-중앙광장");
    await confirmDelete(deleting);
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    await deleting.getByRole("button", { name: "목록으로" }).click();
    await expect(deleting).toHaveCount(0);
    await listRow(page, ROUTE_2).click();
    const other = editPanel(page, ROUTE_2);
    await expect(other).toBeVisible();
    releaseDelete();

    await expect(
      page.getByText('"정문-중앙광장" 경로를 삭제했어요'),
    ).toBeVisible();
    await expect(listRow(page, "정문-중앙광장")).toHaveCount(0);
    await expect(other).toBeVisible();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
  });

  test("?id= 링크와 형식 오류 행은 모바일에서도 보기 패널로 연다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addMixedRoutes(state);
    await page.goto("/admin/dashboard/slopes?id=2");
    const view = detailPanel(page, ROUTE_2);
    await expect(view.getByRole("table")).toBeVisible();
    await expect(view.getByRole("button", { name: "경로 편집" })).toBeVisible();

    await view.getByRole("button", { name: "목록으로" }).click();
    await openFromSheet(page, "깨진 경로");
    await expect(page).toHaveURL(/\?id=4$/);
    await expect(
      detailPanel(page, "깨진 경로").getByText(
        "저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요",
      ),
    ).toBeVisible();
  });

  test("바텀시트 맨 아래 범례 편집으로 같은 모달이 열린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await expect(page.getByRole("group", { name: "목록 필터" })).toHaveCount(0);
    const edit = listPanel(page).getByRole("button", { name: "범례 편집" });
    // 접힌 시트는 첫 행을 보이려고 아랫줄을 숨긴다
    await expect(edit).toBeHidden();
    await listPanel(page).getByRole("button", { name: "목록 펼치기" }).click();
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "범례 편집" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

test.describe("경사도 작업 화면 — 저장 안 한 변경", () => {
  const ROUTE_2 = "안암병원 정문 경사로";

  /** 경로 2의 편집을 열고 구간 값을 고친다. 가드가 dirty를 받을 때까지 기다린다 */
  async function editValue(page: Page) {
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, ROUTE_2);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    // 지도가 좌표를 다시 읽어 초안에 새 배열을 써넣는 것까지 기다린다
    await expect(previewLines(page).first()).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);
    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await expect.poll(() => unloadBlocked(page)).toBe(true);
    return detail;
  }

  test("값을 고친 채 다른 행을 고르면 묻고, 취소하면 값이 남고, 나가기면 그 행의 보기다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const detail = await editValue(page);

    await listRow(page, "정문-중앙광장").click();
    await expect(leaveDialog(page)).toContainText(
      "지금 나가면 입력한 값이 사라져요",
    );
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");

    await listRow(page, "정문-중앙광장").click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\?id=1$/);
    await expect(detailPanel(page, "정문-중앙광장")).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);
  });

  test("값을 고친 채 검색하면 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    const detail = await editValue(page);
    const search = listPanel(page).getByRole("searchbox", {
      name: "경사도 경로 검색",
    });

    await search.fill("중앙광장");
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");
    await expect(search).toHaveValue("");

    await search.fill("중앙광장");
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(search).toHaveValue("중앙광장");
    await expect(detail).toHaveCount(0);
  });

  test("헤더 메뉴로 나가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await editValue(page);
    const landmarks = adminNav(page).getByRole("link", { name: "명소" });

    await landmarks.click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\/slopes\?id=2&edit=1$/);

    await landmarks.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("같은 화면의 헤더 메뉴는 편집을 닫고, 저장 안 한 변경이 있으면 먼저 묻는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const detail = await editValue(page);
    const slopes = adminNav(page).getByRole("link", { name: "경사도" });

    await slopes.click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\?id=2&edit=1$/);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");

    await slopes.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(detail).toHaveCount(0);
  });

  test("브라우저 뒤로가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await adminNav(page).getByRole("link", { name: "경사도" }).click();
    await listRow(page, ROUTE_2).click();
    await detailPanel(page, ROUTE_2)
      .getByRole("button", { name: "경로 편집" })
      .click();
    const detail = editPanel(page, ROUTE_2);
    await expect(previewLines(page).first()).toBeVisible();
    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await expect.poll(() => unloadBlocked(page)).toBe(true);

    await page.evaluate(() => window.history.back());
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\/slopes\?id=2&edit=1$/);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");

    await page.evaluate(() => window.history.back());
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).not.toHaveURL(/edit=1/);
  });

  test("저장한 뒤에는 새로고침 경고가 풀리고 다른 행을 고를 때 묻지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const detail = await editValue(page);

    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("경로가 수정되었어요")).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);

    await listRow(page, "정문-중앙광장").click();
    await expect(detailPanel(page, "정문-중앙광장")).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("새 경로는 선만 그려도 저장 안 한 변경이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await expect.poll(() => unloadBlocked(page)).toBe(false);

    await drawRoute(page, TWO_POINTS);
    await expect(detail.getByLabel("구간 1 경사도")).toBeVisible();
    await expect(detail.getByLabel("경로 이름")).toHaveValue("");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("");
    await expect.poll(() => unloadBlocked(page)).toBe(true);

    await listRow(page, ROUTE_2).click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail).toBeVisible();

    await listRow(page, ROUTE_2).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(detailPanel(page, ROUTE_2)).toBeVisible();
  });

  test("꼭짓점만 끌어 옮겨도 저장 안 한 변경이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    const detail = editPanel(page, ROUTE_2);
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    const preview = previewLines(page).first();
    await expect(preview).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);

    const mapBox = (await editMap(page).boundingBox())!;
    const marker = page.locator(".marker-icon").first();
    // 편집 주소로 들어오면 작업 화면이 지도를 경로로 옮긴다. 멈추기 전에 잡으면 끌기가 꼭짓점이 아니라 지도에 간다
    const markerCenter = await settledCenter(marker);
    const before = await preview.getAttribute("d");
    await page.mouse.move(markerCenter.x, markerCenter.y);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + 600, mapBox.y + 400, { steps: 10 });
    await page.mouse.up();

    await expect(preview).not.toHaveAttribute("d", before ?? "");
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    await expect.poll(() => unloadBlocked(page)).toBe(true);

    await detail.getByRole("button", { name: "취소", exact: true }).click();
    await expect(leaveDialog(page)).toBeVisible();
  });
});

test.describe("경사도 작업 화면 — 범례 편집", () => {
  function bandsDialog(page: Page) {
    return page.getByRole("dialog", { name: "범례 편집" });
  }

  async function openBands(page: Page) {
    await listPanel(page).getByRole("button", { name: "범례 편집" }).click();
    await expect(bandsDialog(page)).toBeVisible();
    return bandsDialog(page);
  }

  function saveButton(dialog: Locator) {
    return dialog.getByRole("button", { name: "저장", exact: true });
  }

  function sentUppers(state: MockState, index = 0) {
    return (
      state.slopeBandsPosts[index] as {
        bands: { upperPercent: number | null }[];
      }
    ).bands.map((band) => band.upperPercent);
  }

  test("상한 하나를 바꿔 저장하면 본문이 가고 작업 화면 선 색이 다시 조회하지 않고 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let listReads = 0;
    await page.route(slopesRequest, async (route) => {
      if (slopeListGet(route)) listReads += 1;
      await route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    await expect(routeLine(page, 1)).toHaveAttribute("stroke", "#8BC34A");
    const readsBefore = listReads;

    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    // 경로 1은 3°(5.24%)다. 첫 상한을 5%로 내리면 둘째 구간(노랑)이 된다
    await dialog.getByLabel("구간 1 상한").fill("5");
    await saveButton(dialog).click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator(".ku-toast").filter({ hasText: "범례를 저장했어요" }),
    ).toBeVisible();
    expect(state.slopeBandsPosts).toHaveLength(1);
    // 손대지 않은 상한은 비율 상수 그대로다. 100/12로 적지 않는다 — (1/12)*100과 다른 값이다
    expect(sentUppers(state)).toEqual([5, (1 / 12) * 100, (1 / 8) * 100, null]);
    await expect(routeLine(page, 1)).toHaveAttribute("stroke", "#FFD600");
    expect(listReads).toBe(readsBefore);
  });

  test("아무것도 고치지 않고 저장하면 상한이 기본값 상수 그대로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(sentUppers(state)).toEqual([
      (1 / 18) * 100,
      (1 / 12) * 100,
      (1 / 8) * 100,
      null,
    ]);
  });

  test("단위를 오가도 손대지 않은 상한이 그대로 가고, ° 단위에서 190을 치면 문구가 뜨고 저장이 비활성이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    await expect(dialog.getByLabel("구간 2 상한")).toHaveValue("8.33");
    await dialog.getByRole("button", { name: "도(°)" }).click();
    await expect(dialog.getByLabel("구간 2 상한")).toHaveValue("4.76");
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(sentUppers(state)).toEqual([
      (1 / 18) * 100,
      (1 / 12) * 100,
      (1 / 8) * 100,
      null,
    ]);

    const again = await openBands(page);
    await again.getByLabel("구간 3 상한").fill("190");
    await expect(
      again.getByText("0°보다 크고 45° 이하로 적어 주세요"),
    ).toBeVisible();
    await expect(saveButton(again)).toBeDisabled();
  });

  test("미리보기 툴팁을 누르면 툴팁만 닫히고 그 아래 단위 버튼은 눌리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    const percent = dialog.getByRole("button", { name: "퍼센트(%)" });
    await expect(percent).toHaveAttribute("aria-pressed", "false");

    await dialog
      .getByRole("group", { name: "경사도 범례" })
      .getByRole("button", { name: /^보도 기준 이내,/ })
      .click();
    const tooltip = dialog.getByRole("tooltip");
    await expect(tooltip).toContainText("보도 기준 1/18 이하");
    await tooltip.click();
    await expect(tooltip).toHaveCount(0);
    await expect(percent).toHaveAttribute("aria-pressed", "false");

    await percent.click();
    await expect(percent).toHaveAttribute("aria-pressed", "true");
  });

  test("미리보기 툴팁의 Esc는 툴팁만 닫고, 한 번 더 누르면 모달이 닫힌다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByLabel("구간 1 이름").fill("평지");
    const cell = dialog
      .getByRole("group", { name: "경사도 범례" })
      .getByRole("button", { name: /^평지,/ });
    await cell.focus();
    await expect(dialog.getByRole("tooltip")).toContainText("평지");

    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("tooltip")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("구간 1 이름")).toHaveValue("평지");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("범례 설정을 읽지 못하면 범례 편집이 비활성이고 사유를 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.slopeBandsReadFails = true;
    await page.goto("/admin/dashboard/slopes");
    const button = listPanel(page).getByRole("button", { name: "범례 편집" });
    const reason =
      "범례 설정을 읽지 못해 편집할 수 없어요. 새로 고친 뒤 다시 시도해 주세요";
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", reason);
    await expect(button).toHaveAccessibleDescription(reason);
  });

  test("상한을 역순으로 넣으면 검증 문구가 뜨고 저장과 미리보기가 멈춘다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    await dialog.getByLabel("구간 2 상한").fill("3");
    await expect(
      dialog.getByText("구간 2의 상한은 앞 구간보다 0.01%p 이상 커야 해요"),
    ).toBeVisible();
    await expect(saveButton(dialog)).toBeDisabled();
    await expect(
      dialog.getByText("입력을 고치면 미리보기가 다시 보여요"),
    ).toBeVisible();
  });

  test("2개일 때 삭제, 6개일 때 구간 추가가 비활성이고, 기본값으로는 기본값을 보낸다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    const rows = dialog.locator(".ku-bands-modal-row");

    await dialog.getByRole("button", { name: "구간 1 삭제" }).click();
    await dialog.getByRole("button", { name: "구간 1 삭제" }).click();
    await expect(rows).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "구간 1 삭제" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "구간 2 삭제" }),
    ).toBeDisabled();

    const add = dialog.getByRole("button", { name: "구간 추가" });
    for (let i = 0; i < 4; i++) await add.click();
    await expect(rows).toHaveCount(6);
    await expect(add).toBeDisabled();
    // 새 행은 마지막 바로 앞에 들어가고 색은 앞 구간(특례 범위)의 색이다
    await expect(dialog.getByLabel("구간 2 색", { exact: true })).toHaveValue(
      "#FF9800",
    );

    await dialog.getByRole("button", { name: "기본값으로" }).click();
    await expect(rows).toHaveCount(4);
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(state.slopeBandsPosts[0]).toEqual({
      bands: [
        {
          name: "보도 기준 이내",
          upperPercent: (1 / 18) * 100,
          color: "#8BC34A",
          description: "보도 기준 1/18 이하",
        },
        {
          name: "완화 범위",
          upperPercent: (1 / 12) * 100,
          color: "#FFD600",
          description: "완화 한도 1/12 이하",
        },
        {
          name: "특례 범위",
          upperPercent: (1 / 8) * 100,
          color: "#FF9800",
          description: "경사로 특례 한도 1/8 이하",
        },
        { name: "초과", upperPercent: null, color: "#E53935", description: "" },
      ],
    });
  });
});
