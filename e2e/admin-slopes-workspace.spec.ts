import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "경사도 경로", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
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
  return page.locator(".leaflet-pane.slope-preview-pane path");
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

function serverError(route: Route) {
  return route.fulfill({
    status: 500,
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/json",
    body: "{}",
  });
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

/** 확인 필요·1/12 초과 구간이 섞인 경로와 저장 형식이 깨진 경로를 더한다 */
function addChipRoutes(state: MockState) {
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

test.describe("경사도 작업 화면 — 목록", () => {
  test("칩·검색·정렬로 목록을 좁히고 칩 개수는 전체 기준이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipRoutes(state);
    await page.goto("/admin/dashboard/slopes");
    const list = listPanel(page);
    const names = list.getByTestId("admin-list-item-name");

    await expect(
      list.getByText("구간별 경사를 기록한 보행 경로 · 총 4개"),
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveText("4개 표시");
    await expect(
      list.getByRole("button", { name: "전체 4개" }),
    ).toHaveAttribute("aria-pressed", "true");
    // 형식 오류 행은 두 칩 어디에도 들지 않는다
    await expect(
      list.getByRole("button", { name: "1/12 초과 포함 2개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "확인 필요 1개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("list", { name: "범례" }).getByRole("listitem"),
    ).toHaveText(["1/12 이내", "1/12 초과", "30%(16.7°) 초과"]);

    await list.getByRole("button", { name: "1/12 초과 포함 2개" }).click();
    await expect(names).toHaveText(["급경사 계단길", "안암병원 정문 경사로"]);
    await expect(list.getByRole("status")).toHaveText("2개 표시");

    await list.getByRole("button", { name: "확인 필요 1개" }).click();
    await expect(names).toHaveText(["급경사 계단길"]);

    await list.getByRole("button", { name: "전체 4개" }).click();
    const search = list.getByRole("searchbox", { name: "경사도 경로 검색" });
    await expect(search).toHaveAttribute("placeholder", "경로명 검색");
    await search.fill("중앙광장");
    await expect(names).toHaveText(["정문-중앙광장"]);
    await expect(list.getByRole("button", { name: "전체 4개" })).toBeVisible();

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

  test("행에 판정 배지·메타·구간 거리 비례 프로파일 막대를 보인다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipRoutes(state);
    await page.goto("/admin/dashboard/slopes");

    const ok = listRow(page, "정문-중앙광장");
    await expect(ok.locator(".ku-row-badge")).toHaveText("기준 이내");
    await expect(ok.locator(".ku-row-badge")).toHaveCSS(
      "background-color",
      "rgb(234, 243, 237)",
    );

    const over = listRow(page, "안암병원 정문 경사로");
    await expect(over.locator(".ku-row-badge")).toHaveText("1/12 초과 1구간");
    await expect(over).toContainText("1개 구간 · 12.4m · 최대 7.2° · 수정 ");
    const overProfile = over.locator(".ku-slope-profile");
    await expect(overProfile).toHaveAttribute("aria-hidden", "true");
    await expect(overProfile.locator("span")).toHaveCount(1);
    await expect(overProfile.locator("span")).toHaveCSS(
      "background-color",
      "rgb(230, 171, 2)",
    );

    const extreme = listRow(page, "급경사 계단길");
    await expect(extreme.locator(".ku-row-badge")).toHaveText(
      "확인 필요 1구간",
    );
    await expect(extreme).toContainText(
      "2개 구간 · 40.1m · 최대 20.0° · 수정 ",
    );
    await expect(extreme.locator(".ku-slope-profile span")).toHaveCount(2);

    const broken = listRow(page, "깨진 경로");
    await expect(broken.locator(".ku-row-badge")).toHaveText("형식 오류");
    await expect(broken).not.toContainText("구간 ·");
    await expect(broken).toContainText("수정 ");
    await expect(broken.locator(".ku-slope-profile span")).toHaveCount(0);
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

  test("선은 판정 색이고 고르면 나머지가 흐려지며 고른 경로에만 구간 번호가 붙는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const first = routeLine(page, 1);
    const second = routeLine(page, 2);

    // 픽스처 경로 1·2의 판정 색(설계 2026-10-14 2.1)
    await expect(first).toHaveAttribute("stroke", "#1B9E77");
    await expect(second).toHaveAttribute("stroke", "#E6AB02");
    await expect(first).toHaveAttribute("stroke-linecap", "round");
    await expect(first).toHaveAttribute("stroke-width", "5");
    await expect(first).toHaveAttribute("stroke-opacity", "1");
    await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);

    await listRow(page, "안암병원 정문 경사로").click();
    await expect(first).toHaveAttribute("stroke-opacity", "0.28");
    await expect(second).toHaveAttribute("stroke-opacity", "1");
    await expect(second).toHaveAttribute("stroke-width", "7");
    const labels = page.locator(".ku-slope-segment-label");
    await expect(labels).toHaveCount(1);
    await expect(labels).toHaveText("1");
    await expect(labels).toHaveCSS("display", "flex");
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
      "판정",
    ]);
    const rows = table.locator("tbody").getByRole("row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole("cell")).toHaveText([
      "1",
      "12.4m",
      "7.2° · 12.6%",
      "1/12 초과",
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

    await detail.getByLabel("구간 1 경사도").fill("9.4");
    await detail.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByText("경로가 수정되었어요")).toBeVisible();
    await expect(page).toHaveURL(/\?id=2$/);
    await expect(detailPanel(page, "안암병원 정문 경사로")).toBeVisible();
    const saved = state.slopes.find((row) => row.id === 2);
    const segments = saved!.segments as Array<Record<string, unknown>>;
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
    await detail.getByLabel("구간 1 경사도").fill("10");
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\?id=3$/);

    await page.goto("/");
    await page.getByRole("checkbox", { name: "경사도" }).check();

    // 10°(17.63%)의 공개 지도 연속 색. 픽스처의 두 행(3°, 7.2°)은 다른 색이라 방금 저장한 경로만 잡힌다.
    const saved = page.locator('path[stroke="#AD2936"]').first();
    await expect(saved).toBeVisible();

    await saved.dispatchEvent("click");
    const popup = page.locator(".leaflet-popup");
    await expect(popup).toContainText("끝단 시험 경사로");
    await expect(popup).toContainText("17.6%");
    await expect(popup).toContainText("10.0°");
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

  test("수정 화면을 열면 불러온 경사값으로 판정 색 미리보기 선이 그려진다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");

    // 7.2°는 1/12 초과(설계 2026-10-14 2.1)
    await expect(previewLines(page).first()).toHaveAttribute(
      "stroke",
      "#E6AB02",
    );
  });

  test("입력한 경사도에 따라 미리보기 선이 판정 색으로 바뀐다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");
    const detail = newPanel(page);
    await drawRoute(page, TWO_POINTS);
    const preview = previewLines(page).first();

    await detail.getByLabel("구간 1 경사도").fill("1");
    await expect(preview).toHaveAttribute("stroke", "#1B9E77");

    await detail.getByLabel("구간 1 경사도").fill("10");
    await expect(preview).toHaveAttribute("stroke", "#E6AB02");

    await detail.getByLabel("구간 1 경사도").fill("20");
    await expect(preview).toHaveAttribute("stroke", "#A50F15");
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

  test("그리는 동안 도구 바는 끝내기·마지막 꼭지점 제거·취소만 보이고 geoman 툴바는 없다", async ({
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
      "취소",
    ].entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(name);
    }
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

  test("마지막 꼭지점 제거는 찍은 점을 하나 빼고 취소는 선 없이 그리기를 끝낸다", async ({
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
    await tool(page, "취소").click();
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
    const before = await preview.getAttribute("d");
    const center = await settledCenter(line);
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

  test("모바일 폭에서도 지도가 화면 폭을 쓴다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");

    await expect(editMap(page)).toBeVisible();
    const box = await editMap(page).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(320);
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

  test("새 경로 편집기에 다른 경로를 판정 색으로 깔고 클릭을 가로채지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?new=1");

    const others = page.locator(".leaflet-slopeOthers-pane path");
    await expect(others).toHaveCount(2);
    // 픽스처 경로 1(3°)·2(7.2°)의 판정 색(설계 2026-10-14 2.1)
    await expect(others.and(page.locator('[stroke="#1B9E77"]'))).toHaveCount(1);
    await expect(others.and(page.locator('[stroke="#E6AB02"]'))).toHaveCount(1);
    await expect(others.and(page.locator(".leaflet-interactive"))).toHaveCount(
      0,
    );
  });

  test("수정 화면은 편집 중인 경로를 빼고 깔며 다른 경로는 드래그 모드에 잡히지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?id=2&edit=1");

    const others = page.locator(".leaflet-slopeOthers-pane path");
    await expect(others).toHaveCount(1);
    await expect(others).toHaveAttribute("stroke", "#1B9E77");

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

test.describe("경사도 작업 화면 — 저장 안 한 변경", () => {
  const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";
  const ROUTE_2 = "안암병원 정문 경사로";

  function adminNav(page: Page) {
    return page.getByRole("navigation", { name: "관리자 메뉴" });
  }

  function leaveDialog(page: Page) {
    return page.getByRole("dialog", { name: LEAVE_TITLE });
  }

  // E2E는 브라우저의 새로고침 경고를 보지 못한다. 같은 이벤트를 직접 내 가드가 막는지 본다.
  // 가드 등록은 effect라 편집 직후에 한 번 읽으면 앞지르므로 항상 poll로 기다린다
  function unloadBlocked(page: Page) {
    return page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  }

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

  test("값을 고친 채 칩을 바꾸면 묻는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipRoutes(state);
    const detail = await editValue(page);
    const chip = listPanel(page).getByRole("button", { name: "확인 필요 1개" });

    await chip.click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("9.4");
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    await chip.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toHaveCount(0);
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
    const before = await preview.getAttribute("d");

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
    await expect(detail.getByLabel("구간 1 경사도")).toHaveValue("7.2");
    await expect.poll(() => unloadBlocked(page)).toBe(true);

    await detail.getByRole("button", { name: "취소", exact: true }).click();
    await expect(leaveDialog(page)).toBeVisible();
  });
});
