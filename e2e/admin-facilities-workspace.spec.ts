import path from "node:path";
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

function listPanel(page: Page) {
  return page.getByRole("region", { name: "독립 시설", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function facilitiesRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/building_facilities");
}

function deletePhotosRequest(url: URL) {
  return url.pathname === "/api/delete-facility-photos";
}

function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

// 목업이 unpkg(ffmpeg 코어)를 끊어 변환은 항상 실패한다. 재생 가능한 원본으로
// 대체되는 경로를 타려면 더미 바이트가 아닌 실제 H.264 파일이 필요하다.
const PLAYABLE_VIDEO = path.join(__dirname, "fixtures/tiny-h264.mp4");

async function openNewFacility(page: Page) {
  await listPanel(page).getByRole("button", { name: "＋ 시설 추가" }).click();
  return detailPanel(page, "시설 추가");
}

function typesRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/facility_types");
}

function serverError(route: Route) {
  return route.fulfill({
    status: 500,
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/json",
    body: "{}",
  });
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

/** 최근 수정순 첫 페이지를 채움 시설로 채워 `f-second-page`를 2페이지로 민다 */
function addSecondPageFacility(state: MockState) {
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
    // 거른 결과는 1개다. 전체 칩이 2를 유지해야 개수가 전체 기준임이 드러난다
    await expect(list.getByRole("button", { name: "전체 2개" })).toBeVisible();

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
        return serverError(route);
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

  test("받은 목록이 있으면 다시 시도의 목록 조회가 실패해도 패널이 멈추지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failTypes = true;
    await page.route(typesRequest, async (route) => {
      if (failTypes && route.request().method() === "GET") {
        failTypes = false;
        return serverError(route);
      }
      return route.fallback();
    });
    let failFacilities = false;
    await page.route(facilitiesRequest, async (route) => {
      if (failFacilities && route.request().method() === "GET") {
        failFacilities = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    // 유형 조회만 실패했다. 목록은 받았으므로 지도에는 마커가 있다
    await expect(
      list.getByText("시설 목록을 불러오지 못했어요."),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-facility-marker-f-installed"),
    ).toBeVisible();

    failFacilities = true;
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "시설 목록을 새로 불러오지 못했어요" }),
    ).toBeVisible();
    await expect(list.getByText("불러오는 중...")).toHaveCount(0);
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(2);
  });

  test("첫 조회가 실패한 ?id= 링크도 다시 시도가 그 항목의 페이지를 연다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addSecondPageFacility(state);
    let failNext = true;
    await page.route(facilitiesRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities?id=f-second-page");
    const list = listPanel(page);

    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(
      list.getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 시설")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/\?id=f-second-page$/);
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
    addSecondPageFacility(state);
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

  test("주변 건물 이름표는 시설 마커 아래 층에 옅게 그린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const label = page.locator(
      ".ku-map-workspace .leaflet-tooltip.bldg-label",
      { hasText: "중앙도서관" },
    );
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS("color", "rgb(138, 131, 125)");

    const paneZ = (selector: string) =>
      page
        .locator(`.ku-map-workspace ${selector}`)
        .evaluate((element) => Number(getComputedStyle(element).zIndex));
    const labelZ = await label.evaluate((element) =>
      Number(getComputedStyle(element.parentElement!).zIndex),
    );
    expect(labelZ).toBeGreaterThan(await paneZ(".leaflet-overlay-pane"));
    expect(labelZ).toBeLessThan(await paneZ(".leaflet-marker-pane"));

    // 선택 마커의 이름 툴팁은 마커 위(기본 tooltip pane)에 남는다
    await listRow(page, "중앙광장 경사로").click();
    await expect(
      page.locator(".leaflet-tooltip-pane .ku-workspace-marker-tooltip"),
    ).toHaveText("중앙광장 경사로");
  });

  test("주변 건물 이름표는 박스 없이 글자만 그리고, 점 데이터인 역은 마커 없이 이름만 그린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings.push(stationBuildingRow(90, "안암역", [127.0316, 37.5889]));
    await page.goto("/admin/dashboard/facilities");

    const label = page.locator(
      ".ku-map-workspace .leaflet-tooltip.bldg-label",
      { hasText: "중앙도서관" },
    );
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(label).toHaveCSS("border-top-width", "0px");
    await expect(label).toHaveCSS("box-shadow", "none");
    await expect(label).not.toHaveCSS("text-shadow", "none");

    await expect(
      page.locator(".ku-map-workspace .leaflet-tooltip.bldg-label", {
        hasText: "안암역",
      }),
    ).toBeVisible();
    await expect(
      page.locator(".ku-map-workspace img.leaflet-marker-icon"),
    ).toHaveCount(0);
  });
});

test.describe("독립 시설 작업 화면 — 상세 패널", () => {
  test("행을 누르면 상세 패널이 열리고 ✕로 닫는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await expect(
      detail.getByRole("heading", { name: "중앙광장 경사로" }),
    ).toBeVisible();
    await expect(detail.getByText(/^경사로 · 수정 /)).toBeVisible();
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "중앙광장 경사로",
    );
    await detail.getByRole("button", { name: "상세 닫기" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("?id= 링크는 그 시설의 상세 패널을 연다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-uninstalled");
    await expect(detailPanel(page, "공사 중 주차구역")).toBeVisible();
  });

  test("설치 상태를 누르면 바로 저장하고 status 토스트로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    const installed = detail.getByRole("button", { name: "설치", exact: true });
    const missing = detail.getByRole("button", { name: "미설치", exact: true });

    await expect(installed).toHaveAttribute("aria-pressed", "true");
    await missing.click();
    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "미설치로 변경되었어요" }),
    ).toBeVisible();
    await expect(missing).toHaveAttribute("aria-pressed", "true");
    await expect(listRow(page, "중앙광장 경사로")).toContainText("미설치");
    expect(
      state.facilities.find((facility) => facility.id === "f-installed")
        ?.is_installed,
    ).toBe(false);
  });

  test("번역이 필요한 시설을 상세에서 재번역한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const target = state.facilities.find(
      (facility) => facility.id === "f-installed",
    );
    if (target) target.translation_status = "failed";
    await page.goto("/admin/dashboard/facilities");
    await expect(listRow(page, "중앙광장 경사로")).toContainText("번역 필요");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await expect(detail.getByText("영문·중문 번역 필요")).toBeVisible();
    await detail.getByRole("button", { name: "재번역" }).click();
    await expect(page.getByText("시설 번역을 완료했어요")).toBeVisible();
    await expect(detail.getByText("✓ 영문·중문 번역 완료")).toBeVisible();
    expect(target?.translation_status).toBe("translated");
  });

  test("인라인 확인을 거쳐 시설을 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "공사 중 주차구역").click();
    const detail = detailPanel(page, "공사 중 주차구역");

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      detail.getByText("삭제한 시설은 복구할 수 없어요."),
    ).toBeVisible();
    // ConfirmModal을 띄우지 않는다(설계 2026-10-14 4.2)
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail.getByRole("button", { name: "취소" }).click();
    await expect(
      detail.getByText("삭제한 시설은 복구할 수 없어요."),
    ).toHaveCount(0);

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await detail
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(page.getByText("시설이 삭제되었어요")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(listRow(page, "공사 중 주차구역")).toHaveCount(0);
    expect(
      state.facilities.some((facility) => facility.id === "f-uninstalled"),
    ).toBe(false);
  });

  test("삭제 확인을 닫으면 초점이 삭제 버튼으로 돌아오고 실패를 알린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failure: "status" | "network" = "status";
    await page.route(deletePhotosRequest, (route) =>
      failure === "status" ? serverError(route) : route.abort(),
    );
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "공사 중 주차구역").click();
    const detail = detailPanel(page, "공사 중 주차구역");
    const trigger = detail.getByRole("button", { name: "삭제", exact: true });
    const confirm = detail.getByRole("group", { name: "삭제 확인" });

    await trigger.click();
    await expect(confirm).toHaveAccessibleDescription(
      "삭제한 시설은 복구할 수 없어요.",
    );
    await expect(confirm.getByRole("button", { name: "취소" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await confirm.getByRole("button", { name: "삭제" }).click();
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "사진 삭제에 실패해 시설을 지우지 못했어요" }),
    ).toBeVisible();
    await expect(trigger).toBeFocused();

    failure = "network";
    await trigger.click();
    await confirm.getByRole("button", { name: "삭제" }).click();
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "시설 삭제에 실패했어요" }),
    ).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(listRow(page, "공사 중 주차구역")).toBeVisible();
  });

  test("저장하는 동안에는 삭제 확인의 삭제를 누를 수 없다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseSave = () => {};
    const saveHeld = new Promise<void>((resolve) => (releaseSave = resolve));
    await page.route(facilitiesRequest, async (route) => {
      if (route.request().method() === "PATCH") await saveHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    const confirm = detail.getByRole("group", { name: "삭제 확인" });

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(confirm.getByRole("button", { name: "삭제" })).toBeDisabled();

    releaseSave();
    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    await expect(confirm.getByRole("button", { name: "삭제" })).toBeEnabled();
  });

  test("삭제를 기다리는 사이 연 다른 시설의 상세는 삭제가 끝나도 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(deletePhotosRequest, async (route) => {
      await deleteHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "공사 중 주차구역").click();
    const deleting = detailPanel(page, "공사 중 주차구역");
    await deleting.getByRole("button", { name: "삭제", exact: true }).click();
    await deleting
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    await listRow(page, "중앙광장 경사로").click();
    const other = detailPanel(page, "중앙광장 경사로");
    await expect(other).toBeVisible();
    releaseDelete();

    await expect(page.getByText("시설이 삭제되었어요")).toBeVisible();
    await expect(listRow(page, "공사 중 주차구역")).toHaveCount(0);
    await expect(other).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-installed$/);
    expect(
      state.facilities.some((facility) => facility.id === "f-uninstalled"),
    ).toBe(false);
  });

  test("삭제를 기다리다 다른 화면으로 떠나도 끝난 삭제가 그 화면의 선택과 입력을 건드리지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(deletePhotosRequest, async (route) => {
      await deleteHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "공사 중 주차구역").click();
    const deleting = detailPanel(page, "공사 중 주차구역");
    await deleting.getByRole("button", { name: "삭제", exact: true }).click();
    await deleting
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "명소" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
    await page
      .getByRole("region", { name: "명소", exact: true })
      .getByRole("button", { name: /다람쥐길/ })
      .click();
    const landmark = detailPanel(page, "다람쥐길");
    const name = landmark.getByLabel("이름 *");
    await name.fill("입력 중인 명소");
    releaseDelete();

    // 삭제 요청이 실제로 끝난 뒤를 본다
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(
      /\/landmarks\?id=11111111-1111-1111-1111-111111111111$/,
    );
    await expect(landmark).toBeVisible();
    await expect(name).toHaveValue("입력 중인 명소");
  });

  test("시설 동영상을 업로드하고 캡션 저장 후 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();
    await expect(page.getByText("동영상 관리")).toBeVisible();

    await expect(page.getByText("가로 영상을 추천드려요")).toBeVisible();
    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);
    await expect(
      page.getByText("용량을 줄이지 못해 원본을 올렸어요"),
    ).toBeVisible();
    await expect(page.locator("video")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.id === "f-installed")
        ?.video_poster_url,
    ).toBe("https://cdn.test/video.jpg");

    const caption = page.getByPlaceholder("동영상 설명 추가...");
    await caption.fill("정문 방향 경사로 영상");
    await caption.blur();
    await expect
      .poll(
        () =>
          state.facilities.find((facility) => facility.id === "f-installed")
            ?.video_caption,
      )
      .toBe("정문 방향 경사로 영상");

    await page.getByRole("button", { name: "동영상 삭제" }).click();
    await page.getByText("동영상을 삭제할까요?").waitFor();
    await page
      .getByRole("dialog", { name: "동영상을 삭제할까요?" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(page.getByText(/동영상 추가/)).toBeVisible();
  });

  test("변환 도구를 불러오는 중에 나가면 업로드 요청이 나가지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseCore = () => {};
    await page.route("https://unpkg.com/**", async (route) => {
      await new Promise<void>((resolve) => (releaseCore = resolve));
      await route.abort();
    });
    const uploadCalls: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/facility-video"))
        uploadCalls.push(pathname);
    });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();

    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);
    // 진행 영역과 업로드 버튼 라벨에 같은 문구가 두 번 나온다.
    await expect(
      page.getByText("변환 도구 불러오는 중...").first(),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "동영상 관리" })
      .getByRole("button", { name: "닫기" })
      .click();
    await page.getByRole("button", { name: "중단하고 나가기" }).click();
    await expect(page.getByText("동영상 관리")).toHaveCount(0);
    releaseCore();

    // 취소 플래그가 없으면 이 사이에 재생 검사를 거쳐 presign이 나간다.
    await page.waitForTimeout(1500);
    expect(uploadCalls).toEqual([]);
  });

  test("포스터 업로드가 실패하면 포스터 없이 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.route("https://upload.test/poster", (route) =>
      route.fulfill({
        status: 500,
        headers: { "access-control-allow-origin": "*" },
        body: "",
      }),
    );
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    await detailPanel(page, "중앙광장 경사로")
      .getByRole("button", { name: "＋ 동영상 연결" })
      .click();

    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);

    await expect(page.locator("video")).toBeVisible();
    const facility = state.facilities.find((item) => item.id === "f-installed");
    expect(facility?.video_url).toBe("https://cdn.test/video.mp4");
    expect(facility?.video_poster_url).toBeNull();
  });

  test("새 시설을 현 위치에 만들어 저장하면 그 시설의 상세로 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const detail = await openNewFacility(page);
    await expect(page).toHaveURL(/\?new=1$/);

    // 저장 전에는 사진·동영상을 올릴 수 없다(설계 2026-10-14 4.2)
    await expect(
      detail.getByRole("button", { name: "＋ 동영상 연결" }),
    ).toBeDisabled();
    await detail.getByLabel("시설 유형 *").selectOption("ramp");
    await detail.getByLabel("시설 이름 (선택)").fill("E2E 경사로");
    await detail.getByRole("button", { name: "현 위치로 찍기" }).click();
    await expect(
      page.getByText("현재 위치를 지도에 표시했어요."),
    ).toBeVisible();
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 추가되었어요!")).toBeVisible();
    await expect(detailPanel(page, "E2E 경사로")).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-created$/);
    expect(
      state.facilities.find((facility) => facility.name === "E2E 경사로"),
    ).toMatchObject({
      building_id: null,
      facility_code: "ramp",
      is_installed: true,
      floor_info: null,
    });
  });

  test("저장과 자동 번역 실패를 나누어 알리고 재번역한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    await page.goto("/admin/dashboard/facilities");
    const draft = await openNewFacility(page);
    await draft.getByLabel("시설 유형 *").selectOption("ramp");
    await draft.getByLabel("시설 이름 (선택)").fill("번역 실패 경사로");
    await draft.getByRole("button", { name: "현 위치로 찍기" }).click();
    await draft.getByRole("button", { name: "저장" }).click();

    await expect(
      page.getByText(
        "시설은 저장했지만 자동 번역에 실패했어요. 상세에서 재번역해 주세요.",
      ),
    ).toBeVisible();
    const detail = detailPanel(page, "번역 실패 경사로");
    await expect(detail.getByText("영문·중문 번역 필요")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.translation_status,
    ).toBe("failed");

    await detail.getByRole("button", { name: "재번역" }).click();
    await expect(page.getByText("시설 번역을 완료했어요")).toBeVisible();
    await expect(detail.getByText("✓ 영문·중문 번역 완료")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.name_en,
    ).toBe("EN 번역 실패 경사로");
  });

  test("캠퍼스 밖 위치는 경고하되 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.61, longitude: 127.06 },
    });
    await page.goto("/admin/dashboard/facilities");
    const detail = await openNewFacility(page);
    await detail.getByLabel("시설 유형 *").selectOption("ramp");
    await detail.getByLabel("시설 이름 (선택)").fill("인접 지역 경사로");
    await detail.getByRole("button", { name: "현 위치로 찍기" }).click();
    await expect(
      detail.getByText(
        "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다.",
      ),
    ).toBeVisible();

    const before = state.facilities.length;
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("시설이 추가되었어요!")).toBeVisible();
    expect(state.facilities).toHaveLength(before + 1);
    expect(state.facilities.at(-1)).toMatchObject({
      name: "인접 지역 경사로",
      lat: 37.61,
      lng: 127.06,
    });
  });

  test("현 위치로 찍으면 지도가 그 핀으로 옮겨 두 패널 사이에 보인다", async ({
    page,
  }) => {
    // 첫 화면(캠퍼스 중심)에서 멀리 떨어진 점이라 지도가 옮기지 않으면 핀이 화면 밖에 찍힌다
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.61, longitude: 127.06 },
    });
    await page.goto("/admin/dashboard/facilities");
    const detail = await openNewFacility(page);
    await detail.getByRole("button", { name: "현 위치로 찍기" }).click();
    await expect(
      page.getByText("현재 위치를 지도에 표시했어요."),
    ).toBeVisible();

    const pin = page.getByTestId("admin-facility-marker-new");
    // 지도가 움직이는 동안에는 자리가 바뀌므로 멈출 때까지 다시 잰다
    await expect
      .poll(async () => {
        const [pinBox, mapBox, listBox, detailBox] = await Promise.all([
          pin.boundingBox(),
          page.locator(".ku-map-workspace-map").boundingBox(),
          listPanel(page).boundingBox(),
          detail.boundingBox(),
        ]);
        if (!pinBox || !mapBox || !listBox || !detailBox) return "잴 수 없음";
        const x = pinBox.x + pinBox.width / 2;
        const y = pinBox.y + pinBox.height / 2;
        const between =
          x > listBox.x + listBox.width &&
          x < detailBox.x &&
          y > mapBox.y &&
          y < mapBox.y + mapBox.height;
        return between
          ? "두 패널 사이"
          : `밖 (${Math.round(x)}, ${Math.round(y)})`;
      })
      .toBe("두 패널 사이");
  });

  test("설치 상태를 바꾼 뒤 이름을 고쳐 저장해도 설치 상태가 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");

    await detail.getByRole("button", { name: "미설치", exact: true }).click();
    await expect(page.getByText("미설치로 변경되었어요")).toBeVisible();
    await detail.getByLabel("시설 이름 (선택)").fill("고친 경사로");
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.id === "f-installed"),
    ).toMatchObject({ name: "고친 경사로", is_installed: false });
  });

  test("지도를 눌러 위치를 옮기고 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText("37.5894, 127.0325");

    // 목록 패널(왼쪽)과 상세 패널(오른쪽) 사이의 빈 지도
    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await expect(coords).not.toHaveText("37.5894, 127.0325");
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    const saved = state.facilities.find(
      (facility) => facility.id === "f-installed",
    );
    expect(saved?.lat).not.toBe(37.5894);
    expect(saved?.lng).not.toBe(127.0325);
  });
});

test.describe("독립 시설 작업 화면 — 저장 안 한 변경", () => {
  const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";

  async function editName(page: Page) {
    await listRow(page, "중앙광장 경사로").click();
    const detail = detailPanel(page, "중앙광장 경사로");
    await detail.getByLabel("시설 이름 (선택)").fill("고치는 중");
    return detail;
  }

  test("다른 항목을 고르기 전에 묻고, 취소하면 입력이 남는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const detail = await editName(page);

    await listRow(page, "공사 중 주차구역").click();
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await expect(confirm).toContainText("지금 나가면 입력한 값이 사라져요");
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );
    await expect(page).toHaveURL(/\?id=f-installed$/);

    await listRow(page, "공사 중 주차구역").click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(detailPanel(page, "공사 중 주차구역")).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-uninstalled$/);
  });

  test("칩을 바꾸기 전에도 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await editName(page);
    const chip = listPanel(page).getByRole("button", { name: "미설치 1개" });

    await chip.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("헤더 메뉴로 나가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await editName(page);
    const landmarks = page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "명소" });

    await landmarks.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page).toHaveURL(
      /\/admin\/dashboard\/facilities\?id=f-installed$/,
    );

    await landmarks.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("브라우저 뒤로가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "독립 시설" })
      .click();
    const detail = await editName(page);

    await page.evaluate(() => window.history.back());
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(
      /\/admin\/dashboard\/facilities\?id=f-installed$/,
    );
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );

    await page.evaluate(() => window.history.back());
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
  });

  test("같은 화면의 헤더 메뉴는 선택을 풀고, 저장 안 한 변경이 있으면 먼저 묻는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const facilities = page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "독립 시설" });

    await listRow(page, "공사 중 주차구역").click();
    await facilities.click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
    await expect(detailPanel(page, "공사 중 주차구역")).toHaveCount(0);

    const detail = await editName(page);
    await facilities.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
    await expect(detail).toHaveCount(0);
  });

  // E2E는 브라우저의 새로고침 경고를 보지 못한다. 같은 이벤트를 직접 내 가드가 막는지 본다
  function unloadBlocked(page: Page) {
    return page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  }

  async function openFromBuildings(page: Page) {
    await page.goto("/admin/dashboard/buildings");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "독립 시설" })
      .click();
  }

  async function saveAndSettle(page: Page, detail: Locator) {
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);
  }

  test("저장한 뒤에는 새로고침 경고를 풀고 다른 항목을 고를 때 묻지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    expect(await unloadBlocked(page)).toBe(false);
    const detail = await editName(page);
    expect(await unloadBlocked(page)).toBe(true);

    await saveAndSettle(page, detail);
    await listRow(page, "공사 중 주차구역").click();
    await expect(detailPanel(page, "공사 중 주차구역")).toBeVisible();
    await expect(page.getByRole("dialog", { name: LEAVE_TITLE })).toHaveCount(
      0,
    );
  });

  test("저장한 뒤 다시 고친 채 뒤로가기를 해도 나가기면 이전 화면으로 간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await openFromBuildings(page);
    const historyLength = () => page.evaluate(() => window.history.length);
    const detail = await editName(page);
    await expect.poll(() => unloadBlocked(page)).toBe(true);
    const trapped = await historyLength();
    await saveAndSettle(page, detail);

    await detailPanel(page, "고치는 중")
      .getByLabel("시설 이름 (선택)")
      .fill("다시 고치는 중");
    // 다시 고쳐도 기록을 더 쌓지 않는다(설계 2026-10-14 3.4)
    await expect.poll(() => unloadBlocked(page)).toBe(true);
    expect(await historyLength()).toBe(trapped);
    await page.evaluate(() => window.history.back());
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
  });

  test("다른 사이트에서 들어온 탭에서도 뒤로가기의 나가기는 그 사이트로 돌아간다", async ({
    page,
    baseURL,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const external = "https://external.test/";
    await page.route(external, (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<a href="${baseURL}/admin/dashboard/facilities">관리자</a>`,
      }),
    );
    await page.goto(external);
    await page.getByRole("link", { name: "관리자" }).click();
    await editName(page);

    await page.evaluate(() => window.history.back());
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(external);
  });

  test("뒤로 갈 기록이 없으면 나가기에도 머물고, 다음 뒤로가기에서 다시 묻는다", async ({
    page: opener,
    baseURL,
  }) => {
    // Playwright가 연 페이지는 about:blank 기록이 남는다. 주소 없이 연 창은 첫 이동이 빈 문서를 갈아 끼운다
    const [page] = await Promise.all([
      opener.waitForEvent("popup"),
      opener.evaluate(() => window.open()),
    ]);
    await installMockBackend(page, { authenticated: true });
    await page.goto(`${baseURL}/admin/dashboard/facilities`);
    expect(await page.evaluate(() => window.history.length)).toBe(1);
    const detail = await editName(page);

    await page.evaluate(() => window.history.back());
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await confirm.getByRole("button", { name: "나가기" }).click();
    // 판정을 기다리는 동안 낸 beforeunload는 떠나는 것으로 읽히므로, 기록을 다시 쌓은 뒤에 본다
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window.history.state as Record<string, unknown> | null)
              ?.kuUnsavedTrap === true,
        ),
      )
      .toBe(true);
    await expect(page).toHaveURL(
      /\/admin\/dashboard\/facilities\?id=f-installed$/,
    );
    expect(await unloadBlocked(page)).toBe(true);
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );

    await page.evaluate(() => window.history.back());
    await expect(confirm).toBeVisible();
  });

  test("앞으로 가기로 돌아온 기록에서 고친 뒤 나가기도 이전 화면으로 간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await openFromBuildings(page);
    await saveAndSettle(page, await editName(page));
    // 저장해도 쌓은 기록은 남아, 이 뒤로가기는 같은 화면에 머문다(설계 2026-10-14 3.4)
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\?id=f-installed$/);
    await page.evaluate(() => window.history.forward());
    await expect(page).toHaveURL(/\?id=f-installed$/);

    await detailPanel(page, "고치는 중")
      .getByLabel("시설 이름 (선택)")
      .fill("다시 고치는 중");
    await page.evaluate(() => window.history.back());
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
  });

  test("뒤로가기 확인이 뜬 채 한 번 더 뒤로 가면 확인 창을 거둔다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await openFromBuildings(page);
    await editName(page);

    await page.evaluate(() => window.history.back());
    const confirm = page.getByRole("dialog", { name: LEAVE_TITLE });
    await expect(confirm).toBeVisible();
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
    await expect(confirm).toHaveCount(0);
  });

  test("같은 화면의 헤더 메뉴는 취소하면 입력을 남기고, 저장하는 동안에는 선택을 닫지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let releaseSave = () => {};
    const saveHeld = new Promise<void>((resolve) => (releaseSave = resolve));
    await page.route(facilitiesRequest, async (route) => {
      if (route.request().method() === "PATCH") await saveHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/facilities");
    const facilities = page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "독립 시설" });
    const detail = await editName(page);

    await facilities.click();
    await page
      .getByRole("dialog", { name: LEAVE_TITLE })
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page).toHaveURL(/\?id=f-installed$/);
    await expect(detail.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );

    await detail.getByRole("button", { name: "저장" }).click();
    await facilities.click();
    releaseSave();
    await expect(page.getByText("시설이 수정되었어요!")).toBeVisible();
    await expect(page).toHaveURL(/\?id=f-installed$/);
    await expect(detailPanel(page, "고치는 중")).toBeVisible();
    await expect(page.getByRole("dialog", { name: LEAVE_TITLE })).toHaveCount(
      0,
    );
  });
});

test.describe("독립 시설 작업 화면 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("바텀시트에서 행을 누르면 지도 띠를 남긴 전체 화면 상세가 열린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const sheet = listPanel(page);

    const handle = sheet.getByRole("button", { name: "목록 펼치기" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await handle.click();
    await expect(
      sheet.getByRole("button", { name: "목록 접기" }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("searchbox", { name: "독립 시설 검색" }).fill("공사");
    await expect(sheet.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
    ]);
    const row = listRow(page, "공사 중 주차구역");
    const rowBox = await row.boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(64);
    await row.click();

    const detail = detailPanel(page, "공사 중 주차구역");
    await expect(
      detail.getByRole("heading", { name: "공사 중 주차구역" }),
    ).toBeVisible();
    await expect(sheet).toBeHidden();
    // 상세 위쪽 띠로 작업 화면의 지도가 보인다(설계 2026-10-14 2.5)
    const strip = await detail.locator(".ku-detail-panel-strip").boundingBox();
    expect(strip?.height).toBe(190);

    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });

  test("상세 위쪽 지도 띠를 누르면 핀이 옮겨진다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-installed");
    const detail = detailPanel(page, "중앙광장 경사로");
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText(/\d/);
    const before = await coords.textContent();
    // 지도는 패널보다 늦게 붙는다. 좌표 클릭은 기다려 주지 않으므로 마커가 뜬 뒤에 누른다
    await expect(page.locator(".ku-workspace-marker--selected")).toBeVisible();

    const strip = await detail.locator(".ku-detail-panel-strip").boundingBox();
    await page.mouse.click(strip!.x + 40, strip!.y + strip!.height - 30);
    await expect(coords).not.toHaveText(before ?? "");
  });
});

test.describe("독립 시설 작업 화면 — 태블릿", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("목록과 상세가 나란히 들어가지 않는 폭에서는 상세를 여는 동안 목록을 숨긴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    const list = listPanel(page);

    await listRow(page, "공사 중 주차구역").click();
    const detail = detailPanel(page, "공사 중 주차구역");
    await expect(detail).toBeVisible();
    await expect(list).toBeHidden();

    const marker = page.getByTestId("admin-facility-marker-f-uninstalled");
    const zoom = page.locator(".ku-map-workspace .leaflet-control-zoom");
    await expect
      .poll(async () => {
        const [markerBox, zoomBox, detailBox] = await Promise.all([
          marker.boundingBox(),
          zoom.boundingBox(),
          detail.boundingBox(),
        ]);
        if (!markerBox || !zoomBox || !detailBox) return "잴 수 없음";
        const markerX = markerBox.x + markerBox.width / 2;
        const zoomRight = zoomBox.x + zoomBox.width;
        return markerX < detailBox.x && zoomRight < detailBox.x
          ? "상세 왼쪽"
          : `겹침 (마커 ${Math.round(markerX)}, 줌 ${Math.round(zoomRight)}, 상세 ${Math.round(detailBox.x)})`;
      })
      .toBe("상세 왼쪽");

    await detail.getByRole("button", { name: "상세 닫기" }).click();
    await expect(detail).toHaveCount(0);
    await expect(list).toBeVisible();
  });

  // 경계는 패널 폭에서 계산한 ADMIN_NARROW_QUERY와 CSS 미디어 쿼리가 함께 정한다. 둘이 어긋나면 한쪽에서 깨진다
  for (const { width, listHidden } of [
    { width: 963, listHidden: true },
    { width: 964, listHidden: false },
  ]) {
    test(`${width}px에서 상세를 열면 목록이 ${listHidden ? "숨는다" : "남고 겹치지 않는다"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await installMockBackend(page, { authenticated: true });
      await page.goto("/admin/dashboard/facilities");
      const list = listPanel(page);

      await listRow(page, "공사 중 주차구역").click();
      const detail = detailPanel(page, "공사 중 주차구역");
      await expect(detail).toBeVisible();
      if (listHidden) {
        await expect(list).toBeHidden();
        return;
      }
      await expect(list).toBeVisible();
      const [listBox, zoomBox, detailBox] = await Promise.all([
        list.boundingBox(),
        page.locator(".ku-map-workspace .leaflet-control-zoom").boundingBox(),
        detail.boundingBox(),
      ]);
      expect(listBox!.x + listBox!.width).toBeLessThan(zoomBox!.x);
      expect(zoomBox!.x + zoomBox!.width).toBeLessThan(detailBox!.x);
    });
  }
});
