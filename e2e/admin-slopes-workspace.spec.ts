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
