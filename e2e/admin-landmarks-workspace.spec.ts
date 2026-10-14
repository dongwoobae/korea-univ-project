import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

const SQUIRREL_ID = "11111111-1111-1111-1111-111111111111";

function listPanel(page: Page) {
  return page.getByRole("region", { name: "명소", exact: true });
}

function listRow(page: Page, name: string) {
  return listPanel(page).getByRole("button", { name: new RegExp(name) });
}

function detailPanel(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function landmarksRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/landmarks");
}

function serverError(route: Route) {
  return route.fulfill({
    status: 500,
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/json",
    body: "{}",
  });
}

/** 목 픽스처와 같은 모양의 명소 행 */
function landmark(overrides: Record<string, unknown>) {
  return {
    name_en: "EN",
    name_zh: "ZH",
    description: null,
    description_en: null,
    description_zh: null,
    icon: "🌳",
    lat: 37.5899,
    lng: 127.033,
    photo_url: "https://cdn.test/photo.webp",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** 최근 수정순 첫 페이지를 채움 명소로 채워 `l-second-page`를 2페이지로 민다 */
function addSecondPageLandmark(state: MockState) {
  for (let index = 0; index < 20; index += 1) {
    state.landmarks.push(
      landmark({
        id: `l-filler-${index}`,
        name: `채움 명소 ${index}`,
        updated_at: `2026-07-30T00:00:${String(index).padStart(2, "0")}Z`,
      }),
    );
  }
  state.landmarks.push(
    landmark({
      id: "l-second-page",
      name: "둘째 쪽 명소",
      updated_at: "2026-07-01T00:00:00Z",
    }),
  );
}

/** 사진이 없는 명소와 번역이 빈 명소를 더한다(다람쥐길은 둘 다 갖췄다) */
function addChipLandmarks(state: MockState) {
  state.landmarks.push(
    landmark({
      id: "l-no-photo",
      name: "사진 없는 연못",
      photo_url: null,
      lat: 37.5905,
      lng: 127.0345,
      updated_at: "2026-07-20T00:00:00Z",
    }),
    landmark({
      id: "l-no-translation",
      name: "번역 빈 정자",
      name_en: "",
      lat: 37.5885,
      lng: 127.0305,
      updated_at: "2026-07-10T00:00:00Z",
    }),
  );
}

test.describe("명소 작업 화면 — 목록과 지도", () => {
  test("칩·검색·정렬로 목록을 좁히고 칩 개수는 전체 기준이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const list = listPanel(page);

    await expect(
      list.getByText("지도에 표시하는 캠퍼스 명소 · 총 3개"),
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveText("3개 표시");
    await expect(
      list.getByRole("button", { name: "전체 3개" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      list.getByRole("button", { name: "사진 없음 1개" }),
    ).toBeVisible();
    await expect(
      list.getByRole("button", { name: "번역 없음 1개" }),
    ).toBeVisible();

    await list.getByRole("button", { name: "사진 없음 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "사진 없는 연못",
    ]);
    await expect(list.getByRole("status")).toHaveText("1개 표시");

    await list.getByRole("button", { name: "번역 없음 1개" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "번역 빈 정자",
    ]);

    await list.getByRole("button", { name: "전체 3개" }).click();
    const search = list.getByRole("searchbox", { name: "명소 검색" });
    await expect(search).toHaveAttribute(
      "placeholder",
      "명소명 또는 설명 검색",
    );
    await search.fill("Squirrel");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "다람쥐길",
    ]);
    // 거른 결과는 1개여도 칩 개수는 전체 기준이다
    await expect(list.getByRole("button", { name: "전체 3개" })).toBeVisible();

    await search.fill("없는 명소입니다");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    await list.getByLabel("명소 정렬").selectOption("name");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "다람쥐길",
      "번역 빈 정자",
      "사진 없는 연못",
    ]);
    await list.getByLabel("명소 정렬").selectOption("updated-asc");
    await expect(list.getByTestId("admin-list-item-name")).toHaveText([
      "번역 빈 정자",
      "사진 없는 연못",
      "다람쥐길",
    ]);
  });

  test("행에 캠퍼스·수정일·배지를 보인다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    state.landmarks.push(
      landmark({
        id: "l-far",
        name: "먼 곳 명소",
        lat: 35.1,
        lng: 129.0,
      }),
    );
    await page.goto("/admin/dashboard/landmarks");

    await expect(listRow(page, "다람쥐길")).toContainText(/ · 수정 /);
    await expect(listRow(page, "먼 곳 명소")).toContainText(
      "캠퍼스 밖 · 수정 ",
    );
    await expect(listRow(page, "사진 없는 연못")).toContainText("사진 없음");
    await expect(listRow(page, "번역 빈 정자")).toContainText("번역 없음");
    await expect(listRow(page, "다람쥐길")).not.toContainText("사진 없음");
    await expect(listRow(page, "다람쥐길")).not.toContainText("번역 없음");
    await expect(listRow(page, "다람쥐길")).toContainText("🐿️");
  });

  test("거른 결과를 지도 마커로 그린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");

    await expect(
      page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-landmark-marker-l-no-photo"),
    ).toBeVisible();

    await listPanel(page)
      .getByRole("button", { name: "사진 없음 1개" })
      .click();
    await expect(
      page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("admin-landmark-marker-l-no-photo"),
    ).toBeVisible();
  });

  test("목록을 받지 못하면 패널 안에 오류와 다시 시도를 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failNext = true;
    await page.route(landmarksRequest, async (route) => {
      if (failNext && route.request().method() === "GET") {
        failNext = false;
        return serverError(route);
      }
      return route.fallback();
    });
    await page.goto("/admin/dashboard/landmarks");
    const list = listPanel(page);

    await expect(
      list.getByText("명소 목록을 불러오지 못했어요."),
    ).toBeVisible();
    await list.getByRole("button", { name: "다시 시도" }).click();
    await expect(list.getByTestId("admin-list-item-name")).toHaveCount(1);
  });

  test("행과 마커가 같은 선택이고 URL에 남는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const row = listRow(page, "사진 없는 연못");

    await page.getByTestId("admin-landmark-marker-l-no-photo").click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\?id=l-no-photo$/);
    await expect(page.locator(".ku-landmark-marker--selected")).toHaveAttribute(
      "data-testid",
      "admin-landmark-marker-l-no-photo",
    );
    await expect(
      page.locator(".leaflet-tooltip-pane .ku-workspace-marker-tooltip"),
    ).toHaveText("사진 없는 연못");

    // 데스크톱에서는 같은 항목을 다시 누르면 선택을 푼다
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);

    await listRow(page, "번역 빈 정자").click();
    await expect(page).toHaveURL(/\?id=l-no-translation$/);
    // 칩을 바꾸면 선택을 푼다
    await listPanel(page)
      .getByRole("button", { name: "사진 없음 1개" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("다른 페이지에 있는 마커를 누르면 목록이 그 페이지로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addSecondPageLandmark(state);
    await page.goto("/admin/dashboard/landmarks");

    await page.getByTestId("admin-landmark-marker-l-second-page").click();
    await expect(
      listPanel(page).getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(listRow(page, "둘째 쪽 명소")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("목록 조회가 늦게 끝나도 ?id= 링크가 그 명소를 연다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(landmarksRequest, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);

    await expect(listRow(page, "다람쥐길")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(detailPanel(page, "다람쥐길")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));
  });

  test("없는 ?id=는 선택을 풀고 알린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks?id=l-missing");

    await expect(
      page.getByText("명소를 찾지 못했어요. 삭제됐거나 주소가 틀렸어요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });
});

test.describe("명소 작업 화면 — 상세 패널", () => {
  test("행을 누르면 상세 패널이 열리고 ✕로 닫는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "다람쥐길").click();
    const detail = detailPanel(page, "다람쥐길");

    await expect(
      detail.getByRole("heading", { name: "다람쥐길" }),
    ).toBeVisible();
    await detail.getByRole("button", { name: "상세 닫기" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("＋ 명소 추가는 새 명소 패널을 연다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();

    await expect(detailPanel(page, "명소 추가")).toBeVisible();
    await expect(page).toHaveURL(/\?new=1$/);
  });
});

test.describe("명소 작업 화면 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("상세는 지도 띠 없이 전체 화면으로 열리고 목록으로 돌아온다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const sheet = listPanel(page);

    await sheet.getByRole("button", { name: "목록 펼치기" }).click();
    const row = listRow(page, "다람쥐길");
    const rowBox = await row.boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(64);
    await row.click();

    const detail = detailPanel(page, "다람쥐길");
    await expect(
      detail.getByRole("heading", { name: "다람쥐길" }),
    ).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(detail.locator(".ku-detail-panel-strip")).toHaveCount(0);

    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });

  test("바텀시트를 펼치고 접으며 위쪽 검색·칩으로 목록을 좁힌다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const sheet = listPanel(page);

    const handle = sheet.getByRole("button", { name: "목록 펼치기" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    const collapsed = await sheet.boundingBox();
    await handle.click();
    const collapse = sheet.getByRole("button", { name: "목록 접기" });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(async () => (await sheet.boundingBox())?.height ?? 0)
      .toBeGreaterThan(collapsed!.height);

    // 칩과 검색은 바텀시트가 아니라 지도 위쪽 막대에 있다
    const photoChip = page.getByRole("button", { name: "사진 없음 1개" });
    const chipBox = await photoChip.boundingBox();
    expect(chipBox!.height).toBeGreaterThanOrEqual(44);
    await photoChip.click();
    await expect(sheet.getByTestId("admin-list-item-name")).toHaveText([
      "사진 없는 연못",
    ]);
    await expect(sheet.getByRole("status")).toHaveText("1개 표시");

    await page.getByRole("button", { name: "전체 3개" }).click();
    await page.getByRole("searchbox", { name: "명소 검색" }).fill("정자");
    await expect(sheet.getByTestId("admin-list-item-name")).toHaveText([
      "번역 빈 정자",
    ]);
    const rowBox = await listRow(page, "번역 빈 정자").boundingBox();
    expect(rowBox!.height).toBeGreaterThanOrEqual(64);

    await collapse.click();
    await expect(
      sheet.getByRole("button", { name: "목록 펼치기" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

async function openSquirrel(page: Page) {
  await listRow(page, "다람쥐길").click();
  return detailPanel(page, "다람쥐길");
}

function toast(page: Page, text: string) {
  return page
    .locator(".ku-toast[role='status'], .ku-toast[role='alert']")
    .filter({ hasText: text });
}

test.describe("명소 작업 화면 — 상세 패널 편집", () => {
  test("헤더에 이모지 버튼·이름·캠퍼스와 수정일을 보인다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    const emojiButton = detail.getByRole("button", { name: /이모지.*🐿️/ });
    await expect(detail.getByRole("button", { name: /이모지/ })).toHaveCount(1);
    await expect(
      detail.locator(".ku-detail-panel-head").getByRole("button", {
        name: /이모지/,
      }),
    ).toBeVisible();
    // 지도를 바로 누를 수 있는 데스크톱에는 위치 고르기가 없다
    await expect(
      detail.getByRole("button", { name: "지도에서 위치 고르기" }),
    ).toHaveCount(0);
    await expect(emojiButton).toHaveAttribute("aria-haspopup", "listbox");
    await expect(emojiButton).toHaveAttribute("aria-expanded", "false");
    const box = await emojiButton.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(
      detail.getByRole("heading", { name: "다람쥐길" }),
    ).toBeVisible();
    await expect(detail.locator(".ku-detail-title p")).toContainText(
      / · 수정 /,
    );
    await expect(detail.getByLabel("이름 *")).toHaveValue("다람쥐길");
    await expect(detail.getByLabel("설명", { exact: true })).toHaveValue(
      "학생들이 쉬어가는 길",
    );
    await expect(detail.locator(".ku-detail-coords")).toHaveText(
      "37.58955, 127.03225",
    );
  });

  test("이름을 고쳐 저장하면 목록과 패널이 새 값이고, 이름이 비면 저장하지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    await detail.getByLabel("이름 *").fill("");
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "명소 이름을 입력해주세요")).toBeVisible();
    expect(state.landmarks[0].name).toBe("다람쥐길");

    await detail.getByLabel("이름 *").fill("도토리길");
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    await expect(detailPanel(page, "도토리길")).toBeVisible();
    await expect(listRow(page, "도토리길")).toBeVisible();
    expect(state.landmarks[0]).toMatchObject({
      name: "도토리길",
      icon: "🐿️",
      photo_url: "https://cdn.test/landmark.webp",
    });
  });

  test("번역 카드가 값을 보이고 빈 값은 번역 없음으로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "번역 빈 정자").click();
    const card = detailPanel(page, "번역 빈 정자").locator(
      ".ku-landmark-translation",
    );

    await expect(card.getByText("번역 없음")).toBeVisible();
    await expect(card).toContainText("English");
    await expect(card).toContainText("中文");
    await expect(card).toContainText("ZH");

    await listRow(page, "다람쥐길").click();
    await expect(
      detailPanel(page, "다람쥐길").locator(".ku-landmark-translation"),
    ).toContainText("Squirrel Trail");
  });

  test("자동번역 채우기는 빈 칸만 채워 직접 고친 영문 이름을 남긴다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.landmarks.push(
      landmark({
        id: "l-empty-translation",
        name: "빈 번역 연못",
        name_en: "",
        name_zh: "",
        description: "물가 쉼터",
        lat: 37.5905,
        lng: 127.0345,
      }),
    );
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "빈 번역 연못").click();
    const detail = detailPanel(page, "빈 번역 연못");

    await detail.getByRole("button", { name: "직접 고치기" }).click();
    await detail.getByLabel("영문 이름").fill("My Pond");
    await detail.getByRole("button", { name: "자동번역 채우기" }).click();

    await expect(detail.getByLabel("중문 이름")).toHaveValue("ZH 빈 번역 연못");
    await expect(detail.getByLabel("영문 설명")).toHaveValue("EN 물가 쉼터");
    await expect(detail.getByLabel("영문 이름")).toHaveValue("My Pond");
    // 채우기는 초안일 뿐 저장하지 않는다
    expect(
      state.landmarks.find((row) => row.id === "l-empty-translation")?.name_zh,
    ).toBe("");

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    expect(
      state.landmarks.find((row) => row.id === "l-empty-translation"),
    ).toMatchObject({ name_en: "My Pond", name_zh: "ZH 빈 번역 연못" });
  });

  test("번역 칸을 고친 채에는 직접 고치기가 접히지 않고, 번역이 실패하면 경고한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "번역 빈 정자").click();
    const detail = detailPanel(page, "번역 빈 정자");
    const toggle = detail.getByRole("button", { name: "직접 고치기" });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await detail.getByLabel("영문 이름").fill("Pavilion");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(detail.getByLabel("영문 이름")).toHaveValue("Pavilion");

    await detail.getByRole("button", { name: "자동번역 채우기" }).click();
    await expect(toast(page, "자동번역에 실패했어요")).toBeVisible();
  });

  test("지도를 누르거나 선택 핀을 끌어 위치를 옮기고 저장한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText("37.58955, 127.03225");
    await expect(detail.locator(".ku-detail-campus")).toContainText(
      "영역 · 지도를 클릭해 위치 변경",
    );

    const map = page.locator(".ku-map-workspace-map .leaflet-container");
    await map.click({ position: { x: 600, y: 150 } });
    await expect(coords).not.toHaveText("37.58955, 127.03225");
    const clicked = await coords.textContent();

    const pin = page.locator(".ku-landmark-marker--selected");
    const box = await pin.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 60, box!.y + 90, { steps: 8 });
    await page.mouse.up();
    await expect(coords).not.toHaveText(clicked!);
    const dragged = await coords.textContent();

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    const [lat, lng] = dragged!.split(", ").map(Number);
    expect(state.landmarks[0].lat).toBeCloseTo(lat, 6);
    expect(state.landmarks[0].lng).toBeCloseTo(lng, 6);
  });

  test("캠퍼스 밖 위치는 경고 문구를 보이되 저장된다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "축소" }).click();
    }
    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await expect(
      detail.getByText(
        "캠퍼스 영역 밖입니다. 인접 지역 명소라면 그대로 저장할 수 있습니다.",
      ),
    ).toBeVisible();
    await expect(detail.locator(".ku-detail-campus")).toHaveAttribute(
      "data-tone",
      "warn",
    );

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    expect(state.landmarks[0].lat).not.toBe(37.58955);
  });

  test("새 명소는 지도 첫 클릭이 위치이고 저장하면 그 명소의 상세로 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();
    const detail = detailPanel(page, "명소 추가");

    await expect(detail.getByText("지도를 눌러 위치를 찍어요")).toBeVisible();
    await expect(
      detail.getByText("지도를 눌러 위치를 찍어 주세요"),
    ).toBeVisible();
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "명소 이름을 입력해주세요")).toBeVisible();

    await detail.getByPlaceholder("예: 다람쥐길").fill("새 쉼터");
    await detail.getByRole("button", { name: /이모지/ }).click();
    await detail.getByLabel("이모지 검색").fill("나무");
    await detail.getByRole("option").first().click();
    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await expect(page.getByTestId("admin-landmark-marker-new")).toBeVisible();

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 추가되었어요")).toBeVisible();
    await expect(detailPanel(page, "새 쉼터")).toBeVisible();
    await expect(page).toHaveURL(/\?id=22222222-2222-2222-2222-222222222222$/);
    expect(state.landmarks.at(-1)).toMatchObject({ name: "새 쉼터" });
  });

  test("저장하는 동안에는 다른 항목 선택·지도 클릭·닫기·삭제가 잠긴다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    let releaseSave = () => {};
    const saveHeld = new Promise<void>((resolve) => (releaseSave = resolve));
    await page.route(landmarksRequest, async (route) => {
      if (route.request().method() === "PATCH") await saveHeld;
      return route.fallback();
    });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);
    const coords = detail.locator(".ku-detail-coords");

    await detail.getByLabel("이름 *").fill("도토리길");
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(
      detail.getByRole("button", { name: "저장 중..." }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "상세 닫기" }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "삭제", exact: true }),
    ).toBeDisabled();

    await listRow(page, "사진 없는 연못").click({ force: true });
    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));
    await expect(coords).toHaveText("37.58955, 127.03225");

    releaseSave();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));
    await expect(detailPanel(page, "도토리길")).toBeVisible();
  });

  test("인라인 확인을 거쳐 명소를 지우면 행이 사라지고 패널이 닫힌다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "사진 없는 연못").click();
    const detail = detailPanel(page, "사진 없는 연못");

    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      detail.getByText("명소와 사진은 복구할 수 없어요."),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();

    await expect(page.getByText("명소가 삭제되었어요")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await expect(listRow(page, "사진 없는 연못")).toHaveCount(0);
    expect(state.landmarks.some((row) => row.id === "l-no-photo")).toBe(false);
  });

  test("삭제를 기다리는 사이 연 다른 명소의 상세는 삭제가 끝나도 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>(
      (resolve) => (releaseDelete = resolve),
    );
    await page.route(
      (url) => url.pathname === "/api/delete-landmark-photo",
      async (route) => {
        await deleteHeld;
        return route.fallback();
      },
    );
    await page.goto("/admin/dashboard/landmarks");
    const deleting = await openSquirrel(page);
    await deleting.getByRole("button", { name: "삭제", exact: true }).click();
    await deleting
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      deleting.getByRole("button", { name: "삭제 중..." }),
    ).toBeDisabled();

    await listRow(page, "번역 빈 정자").click();
    const other = detailPanel(page, "번역 빈 정자");
    await expect(other).toBeVisible();
    releaseDelete();

    await expect(page.getByText("명소가 삭제되었어요")).toBeVisible();
    await expect(listRow(page, "다람쥐길")).toHaveCount(0);
    await expect(other).toBeVisible();
    await expect(page).toHaveURL(/\?id=l-no-translation$/);
  });

  test("삭제가 실패하면 반환된 메시지를 오류로 알리고 행을 남긴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(
      (url) => url.pathname === "/api/delete-landmark-photo",
      (route) => serverError(route),
    );
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);
    await detail.getByRole("button", { name: "삭제", exact: true }).click();
    await detail
      .getByRole("group", { name: "삭제 확인" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "사진 삭제에 실패해 명소를 지우지 못했어요" }),
    ).toBeVisible();
    await expect(listRow(page, "다람쥐길")).toBeVisible();
  });
});

const PHOTO_FILE = {
  name: "pond.png",
  mimeType: "image/png",
  buffer: Buffer.from("not-really-a-png"),
};

function photoInput(detail: ReturnType<typeof detailPanel>) {
  return detail.locator("input[type='file']");
}

test.describe("명소 작업 화면 — 사진", () => {
  test("기존 명소는 사진을 고르는 즉시 올리고 행의 배지가 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    await expect(listRow(page, "사진 없는 연못")).toContainText("사진 없음");
    await listRow(page, "사진 없는 연못").click();
    const detail = detailPanel(page, "사진 없는 연못");

    await expect(detail.getByText("＋ 사진 선택")).toBeVisible();
    await photoInput(detail).setInputFiles(PHOTO_FILE);

    await expect(toast(page, "사진이 업로드되었어요")).toBeVisible();
    await expect(listRow(page, "사진 없는 연못")).not.toContainText(
      "사진 없음",
    );
    await expect(
      detail.getByRole("button", { name: "사진 변경" }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "사진 삭제" }),
    ).toBeVisible();
    expect(
      state.landmarks.find((row) => row.id === "l-no-photo")?.photo_url,
    ).toBe("https://cdn.test/uploaded-landmark.webp");
  });

  test("사진 삭제는 확인 없이 바로 지운다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    await detail.getByRole("button", { name: "사진 삭제" }).click();

    await expect(toast(page, "사진이 삭제되었어요")).toBeVisible();
    await expect(listRow(page, "다람쥐길")).toContainText("사진 없음");
    await expect(detail.getByText("＋ 사진 선택")).toBeVisible();
    expect(state.landmarks[0].photo_url).toBeNull();
  });

  test("사진 삭제가 실패하면 오류로 알리고 사진을 남긴다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route(
      (url) => url.pathname === "/api/delete-landmark-photo",
      (route) => serverError(route),
    );
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    await detail.getByRole("button", { name: "사진 삭제" }).click();
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "사진 삭제에 실패했어요" }),
    ).toBeVisible();
    await expect(listRow(page, "다람쥐길")).not.toContainText("사진 없음");
  });

  test("업로드가 실패하면 서버 메시지를 오류 토스트로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failBuildingPhotoUploads: 1,
    });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    await listRow(page, "사진 없는 연못").click();
    const detail = detailPanel(page, "사진 없는 연못");

    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "테스트 업로드 실패" }),
    ).toBeVisible();
    await expect(listRow(page, "사진 없는 연못")).toContainText("사진 없음");
  });

  test("사진을 바꾼 뒤 이름을 고쳐 저장해도 사진이 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await expect(toast(page, "사진이 업로드되었어요")).toBeVisible();
    await detail.getByLabel("이름 *").fill("도토리길");
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    expect(state.landmarks[0]).toMatchObject({
      name: "도토리길",
      photo_url: "https://cdn.test/uploaded-landmark.webp",
    });
  });

  test("사진 작업 중에는 저장·삭제·사진 버튼·선택이 잠긴다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    let releaseUpload = () => {};
    const uploadHeld = new Promise<void>(
      (resolve) => (releaseUpload = resolve),
    );
    await page.route(
      (url) => url.pathname === "/api/upload-landmark-photo",
      async (route) => {
        await uploadHeld;
        return route.fallback();
      },
    );
    await page.goto("/admin/dashboard/landmarks");
    const detail = await openSquirrel(page);

    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await expect(detail.getByText("업로드 중...")).toBeVisible();
    await expect(detail.getByRole("button", { name: "저장" })).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "삭제", exact: true }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "사진 변경" }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "사진 삭제" }),
    ).toBeDisabled();
    await expect(
      detail.getByRole("button", { name: "상세 닫기" }),
    ).toBeDisabled();

    await listRow(page, "사진 없는 연못").click({ force: true });
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));

    releaseUpload();
    await expect(toast(page, "사진이 업로드되었어요")).toBeVisible();
    await expect(detail.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  test("새 명소는 사진을 미리보기로 들고 있다가 저장할 때 올린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();
    const detail = detailPanel(page, "명소 추가");

    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await detail.getByPlaceholder("예: 다람쥐길").fill("새 연못");
    await photoInput(detail).setInputFiles(PHOTO_FILE);

    await expect(
      toast(page, "명소를 저장할 때 사진도 함께 업로드해요"),
    ).toBeVisible();
    await expect(detail.getByText("저장 시 업로드: pond.png")).toBeVisible();
    await expect(
      detail.locator(".ku-landmark-photo-frame img"),
    ).toHaveAttribute("src", /^blob:/);
    expect(state.landmarks).toHaveLength(1);

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 추가되었어요")).toBeVisible();
    await expect(page).toHaveURL(/\?id=22222222-2222-2222-2222-222222222222$/);
    const created = detailPanel(page, "새 연못");
    await expect(created).toBeVisible();
    await expect(listRow(page, "새 연못")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      created.locator(".ku-landmark-photo-frame img"),
    ).toHaveAttribute("src", /uploaded-landmark/);
    expect(state.landmarks.at(-1)).toMatchObject({
      name: "새 연못",
      photo_url: "https://cdn.test/uploaded-landmark.webp",
    });
  });

  test("새 명소의 고른 사진은 저장 전에 바꾸거나 뺄 수 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();
    const detail = detailPanel(page, "명소 추가");

    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await expect(detail.getByText("저장 시 업로드: pond.png")).toBeVisible();
    await photoInput(detail).setInputFiles({ ...PHOTO_FILE, name: "lake.png" });
    await expect(detail.getByText("저장 시 업로드: lake.png")).toBeVisible();
    await detail.getByRole("button", { name: "사진 삭제" }).click();
    await expect(detail.getByText(/저장 시 업로드/)).toHaveCount(0);
    await expect(detail.getByText("＋ 사진 선택")).toBeVisible();
  });

  test("새 명소의 사진 업로드가 실패해도 명소는 사진 없이 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failBuildingPhotoUploads: 1,
    });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();
    const detail = detailPanel(page, "명소 추가");

    await page
      .locator(".ku-map-workspace-map .leaflet-container")
      .click({ position: { x: 600, y: 150 } });
    await detail.getByPlaceholder("예: 다람쥐길").fill("새 연못");
    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await detail.getByRole("button", { name: "저장" }).click();

    await expect(
      toast(page, "명소는 저장됐지만 사진 업로드에 실패했어요"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?id=22222222-2222-2222-2222-222222222222$/);
    expect(state.landmarks.at(-1)).toMatchObject({ name: "새 연못" });
    expect(state.landmarks.at(-1)?.photo_url ?? null).toBeNull();
    await expect(listRow(page, "새 연못")).toContainText("사진 없음");
  });
});

test.describe("명소 작업 화면 — 저장 안 한 변경", () => {
  const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";

  function adminNav(page: Page) {
    return page.getByRole("navigation", { name: "관리자 메뉴" });
  }

  async function editName(page: Page) {
    const detail = await openSquirrel(page);
    await detail.getByLabel("이름 *").fill("고치는 중");
    return detail;
  }

  function leaveDialog(page: Page) {
    return page.getByRole("dialog", { name: LEAVE_TITLE });
  }

  // E2E는 브라우저의 새로고침 경고를 보지 못한다. 같은 이벤트를 직접 내 가드가 막는지 본다
  function unloadBlocked(page: Page) {
    return page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  }

  test("다른 행을 고르기 전에 묻고, 취소하면 입력이 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const detail = await editName(page);

    await listRow(page, "사진 없는 연못").click();
    const confirm = leaveDialog(page);
    await expect(confirm).toContainText("지금 나가면 입력한 값이 사라져요");
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("이름 *")).toHaveValue("고치는 중");
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));

    await listRow(page, "사진 없는 연못").click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(detailPanel(page, "사진 없는 연못")).toBeVisible();
    await expect(page).toHaveURL(/\?id=l-no-photo$/);
  });

  test("다른 마커를 누르기 전에도 묻는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const detail = await editName(page);

    await page.getByTestId("admin-landmark-marker-l-no-photo").click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("이름 *")).toHaveValue("고치는 중");
    await expect(page).toHaveURL(new RegExp(`\\?id=${SQUIRREL_ID}$`));

    await page.getByTestId("admin-landmark-marker-l-no-photo").click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(detailPanel(page, "사진 없는 연못")).toBeVisible();
    await expect(page).toHaveURL(/\?id=l-no-photo$/);
  });

  test("칩을 바꾸기 전에도 묻는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    const detail = await editName(page);
    const chip = listPanel(page).getByRole("button", { name: "사진 없음 1개" });

    await chip.click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail.getByLabel("이름 *")).toHaveValue("고치는 중");
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    await chip.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
  });

  test("헤더 메뉴로 나가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await editName(page);
    const facilities = adminNav(page).getByRole("link", { name: "독립 시설" });

    await facilities.click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(new RegExp(`/landmarks\\?id=${SQUIRREL_ID}$`));

    await facilities.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities$/);
  });

  test("같은 화면의 헤더 메뉴는 선택을 풀고, 저장 안 한 변경이 있으면 먼저 묻는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const landmarks = adminNav(page).getByRole("link", { name: "명소" });

    await openSquirrel(page);
    await landmarks.click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
    await expect(detailPanel(page, "다람쥐길")).toHaveCount(0);

    const detail = await editName(page);
    await landmarks.click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/landmarks$/);
    await expect(detail).toHaveCount(0);
  });

  test("브라우저 뒤로가기 전에 묻는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await adminNav(page).getByRole("link", { name: "명소" }).click();
    const detail = await editName(page);

    await page.evaluate(() => window.history.back());
    const confirm = leaveDialog(page);
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(new RegExp(`/landmarks\\?id=${SQUIRREL_ID}$`));
    await expect(detail.getByLabel("이름 *")).toHaveValue("고치는 중");

    await page.evaluate(() => window.history.back());
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/buildings$/);
  });

  test("저장한 뒤에는 새로고침 경고를 풀고 다른 행을 고를 때 묻지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks");
    expect(await unloadBlocked(page)).toBe(false);
    const detail: Locator = await editName(page);
    expect(await unloadBlocked(page)).toBe(true);

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    await expect.poll(() => unloadBlocked(page)).toBe(false);

    await listRow(page, "사진 없는 연못").click();
    await expect(detailPanel(page, "사진 없는 연못")).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("새 명소는 사진만 골라도 저장 안 한 변경이라 다른 행을 고르기 전에 묻는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await listPanel(page).getByRole("button", { name: "＋ 명소 추가" }).click();
    const detail = detailPanel(page, "명소 추가");
    expect(await unloadBlocked(page)).toBe(false);

    await photoInput(detail).setInputFiles(PHOTO_FILE);
    await expect(detail.getByText("저장 시 업로드: pond.png")).toBeVisible();
    expect(await unloadBlocked(page)).toBe(true);

    await listRow(page, "다람쥐길").click();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(detail).toBeVisible();

    await listRow(page, "다람쥐길").click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(detailPanel(page, "다람쥐길")).toBeVisible();
  });
});

function pickBar(page: Page) {
  return page.getByRole("region", { name: "위치 고르기", exact: true });
}

/** 지도 영역의 왼쪽 위에서 잰 점을 누른다. 지도는 패널보다 늦게 붙으니 부르기 전에 마커가 뜬 것을 본다 */
async function tapMap(page: Page, x: number, y: number) {
  const box = await page.locator(".ku-map-workspace-map").boundingBox();
  await page.mouse.click(box!.x + x, box!.y + y);
}

/** 고르는 동안 선택 핀이 확인 바 위에 남은 지도의 가운데에 있는지 */
async function pinPlacement(page: Page) {
  const [mapBox, pinBox, barBox] = await Promise.all([
    page.locator(".ku-map-workspace-map").boundingBox(),
    page.locator(".ku-landmark-marker--selected").boundingBox(),
    pickBar(page).boundingBox(),
  ]);
  if (!mapBox || !pinBox || !barBox) return "잴 수 없음";
  const pinY = pinBox.y + pinBox.height / 2;
  const middle = (mapBox.y + 12 + barBox.y) / 2;
  return Math.abs(pinY - middle) <= 24
    ? "가운데"
    : `벗어남 (핀 ${Math.round(pinY)}, 가운데 ${Math.round(middle)})`;
}

/** 지도 영역의 왼쪽 위에서 잰 마커의 중심 */
async function markerCenter(page: Page, marker: Locator) {
  const [mapBox, box] = await Promise.all([
    page.locator(".ku-map-workspace-map").boundingBox(),
    marker.boundingBox(),
  ]);
  return {
    x: Math.round(box!.x + box!.width / 2 - mapBox!.x),
    y: Math.round(box!.y + box!.height / 2 - mapBox!.y),
  };
}

/**
 * 지도가 옮겨진다면 그 애니메이션이 끝날 만큼 기다린다. 지도가 움직이지 않는 것을 보는 단언이라
 * 기다릴 사건이 따로 없다
 */
async function settleMap(page: Page) {
  await page.waitForTimeout(800);
}

test.describe("명소 작업 화면 — 모바일 상세", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("본문 맨 위에 사진 미리보기를 190px로 그리고 하단 취소·저장은 50px이다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);
    const detail = detailPanel(page, "다람쥐길");
    const body = detail.locator(".ku-detail-panel-body");
    const frame = body.locator(".ku-landmark-photo-frame");
    await expect(frame.locator("img")).toBeVisible();

    const [bodyBox, frameBox, nameBox] = await Promise.all([
      body.boundingBox(),
      frame.boundingBox(),
      detail.getByLabel("이름 *").boundingBox(),
    ]);
    expect(frameBox!.height).toBe(190);
    // 본문의 첫 요소이고, 이름 칸과 같은 폭으로 본문을 채운다
    expect(frameBox!.y - bodyBox!.y).toBeLessThanOrEqual(16);
    expect(frameBox!.y + frameBox!.height).toBeLessThan(nameBox!.y);
    expect(Math.abs(frameBox!.width - nameBox!.width)).toBeLessThanOrEqual(1);
    await expect(
      frame.getByRole("button", { name: "사진 변경" }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", { name: "사진 삭제" }),
    ).toBeVisible();

    for (const name of ["취소", "저장"]) {
      const box = await detail
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box!.height, name).toBe(50);
    }
  });

  test("사진이 없으면 같은 자리에 점선 ＋ 사진 선택을 두고, 새 명소는 고른 사진을 미리 본다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addChipLandmarks(state);
    await page.goto("/admin/dashboard/landmarks?id=l-no-photo");
    const detail = detailPanel(page, "사진 없는 연못");
    const empty = detail.getByText("＋ 사진 선택");
    await expect(empty).toBeVisible();
    expect((await empty.boundingBox())!.height).toBe(190);

    await detail.getByRole("button", { name: "목록으로" }).click();
    await listPanel(page).getByRole("button", { name: "＋ 추가" }).click();
    const created = detailPanel(page, "명소 추가");
    await photoInput(created).setInputFiles(PHOTO_FILE);
    await expect(created.getByText("저장 시 업로드: pond.png")).toBeVisible();
    const frame = created.locator(".ku-landmark-photo-frame");
    await expect(frame.locator("img")).toHaveAttribute("src", /^blob:/);
    expect((await frame.boundingBox())!.height).toBe(190);
  });

  test("이모지 버튼은 본문 이름 칸 위에 하나만 두고 피커로 바꾼다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);
    const detail = detailPanel(page, "다람쥐길");
    const emoji = detail.getByRole("button", { name: /이모지/ });

    await expect(
      detail
        .locator(".ku-detail-panel-body")
        .getByRole("button", { name: /이모지.*🐿️/ }),
    ).toBeVisible();
    await expect(emoji).toHaveCount(1);
    await expect(emoji).toHaveAttribute("aria-haspopup", "listbox");
    const [emojiBox, nameBox] = await Promise.all([
      emoji.boundingBox(),
      detail.getByLabel("이름 *").boundingBox(),
    ]);
    expect(emojiBox!.width).toBeGreaterThanOrEqual(44);
    expect(emojiBox!.height).toBeGreaterThanOrEqual(44);
    expect(emojiBox!.y).toBeLessThan(nameBox!.y);
    // 모바일에는 헤더가 없어 캠퍼스·수정일을 이모지 옆에 둔다
    await expect(detail.locator(".ku-landmark-mobile-head")).toContainText(
      / · 수정 /,
    );

    await emoji.click();
    await expect(emoji).toHaveAttribute("aria-expanded", "true");
    await detail.getByLabel("이모지 검색").fill("나무");
    await detail.getByRole("option").first().click();
    await expect(emoji).toHaveAttribute("aria-expanded", "false");
    await expect(emoji).not.toHaveAccessibleName(/🐿️/);
  });
});

test.describe("명소 작업 화면 — 모바일 위치 고르기", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("상세를 접고 지도에서 누른 위치를 이 위치로 초안 좌표로 삼아 저장한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);
    const detail = detailPanel(page, "다람쥐길");
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText("37.58955, 127.03225");
    await detail
      .getByLabel("설명", { exact: true })
      .fill("고르는 동안 남는 설명");
    // 지도는 패널보다 늦게 붙는다. 좌표 클릭은 기다려 주지 않으므로 마커가 뜬 뒤에 누른다
    const pin = page.locator(".ku-landmark-marker--selected");
    await expect(pin).toBeVisible();

    const start = detail.getByRole("button", { name: "지도에서 위치 고르기" });
    await start.click();
    const bar = pickBar(page);
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("지도를 눌러 위치를 고르세요");
    const barCoords = bar.locator(".ku-landmark-pick-coords");
    await expect(barCoords).toHaveText("37.58955, 127.03225");
    await expect(detail).toBeHidden();

    // 핀은 확인 바 위에 남은 지도의 가운데로 옮겨진다
    await expect.poll(() => pinPlacement(page)).toBe("가운데");
    for (const name of ["취소", "이 위치로"]) {
      const box = await bar.getByRole("button", { name }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }

    await tapMap(page, 80, 120);
    await expect(barCoords).not.toHaveText("37.58955, 127.03225");
    const picked = await barCoords.textContent();

    await bar.getByRole("button", { name: "이 위치로" }).click();
    await expect(bar).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(start).toBeFocused();
    await expect(coords).toHaveText(picked!);
    await expect(detail.getByLabel("설명", { exact: true })).toHaveValue(
      "고르는 동안 남는 설명",
    );

    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 수정되었어요")).toBeVisible();
    const [lat, lng] = picked!.split(", ").map(Number);
    expect(state.landmarks[0].lat).toBeCloseTo(lat, 6);
    expect(state.landmarks[0].lng).toBeCloseTo(lng, 6);
  });

  test("취소하면 고르기 전 좌표로 돌아가고 저장 안 한 변경이 남지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);
    const detail = detailPanel(page, "다람쥐길");
    const coords = detail.locator(".ku-detail-coords");
    await expect(coords).toHaveText("37.58955, 127.03225");
    await expect(page.locator(".ku-landmark-marker--selected")).toBeVisible();

    await detail.getByRole("button", { name: "지도에서 위치 고르기" }).click();
    const bar = pickBar(page);
    await expect(bar).toBeVisible();
    await tapMap(page, 80, 120);
    await expect(bar.locator(".ku-landmark-pick-coords")).not.toHaveText(
      "37.58955, 127.03225",
    );
    await bar.getByRole("button", { name: "취소" }).click();

    await expect(bar).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(coords).toHaveText("37.58955, 127.03225");
    await detail.getByRole("button", { name: "목록으로" }).click();
    await expect(detail).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "저장하지 않은 변경사항이 있어요" }),
    ).toHaveCount(0);
  });

  test("새 명소도 위치 고르기로 위치를 찍고 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await expect(
      page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`),
    ).toBeVisible();
    await listPanel(page).getByRole("button", { name: "＋ 추가" }).click();
    const detail = detailPanel(page, "명소 추가");
    await expect(detail.locator(".ku-detail-coords")).toHaveCount(0);

    await detail.getByRole("button", { name: "지도에서 위치 고르기" }).click();
    const bar = pickBar(page);
    await expect(bar).toBeVisible();
    const barCoords = bar.locator(".ku-landmark-pick-coords");
    await expect(barCoords).toHaveCount(0);
    await tapMap(page, 80, 120);
    await expect(page.getByTestId("admin-landmark-marker-new")).toBeVisible();
    await expect(barCoords).toHaveText(/^\d+\.\d+, \d+\.\d+$/);
    const picked = await barCoords.textContent();
    await bar.getByRole("button", { name: "이 위치로" }).click();

    await expect(detail.locator(".ku-detail-coords")).toHaveText(picked!);
    await detail.getByLabel("이름 *").fill("모바일 쉼터");
    await detail.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("명소가 추가되었어요")).toBeVisible();
    const [lat, lng] = picked!.split(", ").map(Number);
    const created = state.landmarks.at(-1)!;
    expect(created).toMatchObject({ name: "모바일 쉼터" });
    expect(created.lat).toBeCloseTo(lat, 6);
    expect(created.lng).toBeCloseTo(lng, 6);
  });

  test("이 위치로 뒤에도 지도는 고른 자리에 머물고, 다시 고르면 고른 자리에서 시작한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(`/admin/dashboard/landmarks?id=${SQUIRREL_ID}`);
    const detail = detailPanel(page, "다람쥐길");
    const pin = page.locator(".ku-landmark-marker--selected");
    await expect(pin).toBeVisible();
    const start = detail.getByRole("button", { name: "지도에서 위치 고르기" });
    const bar = pickBar(page);
    const barCoords = bar.locator(".ku-landmark-pick-coords");

    await start.click();
    await expect.poll(() => pinPlacement(page)).toBe("가운데");
    await tapMap(page, 80, 120);
    await expect(barCoords).not.toHaveText("37.58955, 127.03225");
    const picked = await barCoords.textContent();
    await expect(pin).toBeVisible();
    const tapped = await markerCenter(page, pin);

    await bar.getByRole("button", { name: "이 위치로" }).click();
    await expect(detail).toBeVisible();
    await settleMap(page);
    // 지도가 고르기 전 저장 위치로 되돌아가면 핀이 누른 자리에서 벗어난다
    const after = await markerCenter(page, pin);
    expect(Math.abs(after.x - tapped.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - tapped.y)).toBeLessThanOrEqual(2);

    await start.click();
    await expect(barCoords).toHaveText(picked!);
    await expect.poll(() => pinPlacement(page)).toBe("가운데");
  });

  test("다음 새 명소는 지난 새 명소에서 고른 자리로 지도를 옮기지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    const squirrel = page.getByTestId(`admin-landmark-marker-${SQUIRREL_ID}`);
    await expect(squirrel).toBeVisible();
    const sheet = listPanel(page);
    const bar = pickBar(page);

    await sheet.getByRole("button", { name: "＋ 추가" }).click();
    const detail = detailPanel(page, "명소 추가");
    const start = detail.getByRole("button", { name: "지도에서 위치 고르기" });
    await start.click();
    await tapMap(page, 80, 120);
    await bar.getByRole("button", { name: "이 위치로" }).click();
    // 위치가 있는 채로 다시 고르면 그 자리로 지도를 옮긴다
    await start.click();
    await expect.poll(() => pinPlacement(page)).toBe("가운데");
    await bar.getByRole("button", { name: "이 위치로" }).click();

    await detail.getByRole("button", { name: "목록으로" }).click();
    await page
      .getByRole("dialog", { name: "저장하지 않은 변경사항이 있어요" })
      .getByRole("button", { name: "나가기" })
      .click();
    await expect(detail).toHaveCount(0);
    await settleMap(page);
    const before = await markerCenter(page, squirrel);

    await sheet.getByRole("button", { name: "＋ 추가" }).click();
    await expect(detailPanel(page, "명소 추가")).toBeVisible();
    await settleMap(page);
    const after = await markerCenter(page, squirrel);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  });
});
