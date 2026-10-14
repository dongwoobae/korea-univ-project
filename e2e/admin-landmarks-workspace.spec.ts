import { expect, test, type Page, type Route } from "@playwright/test";
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
      await page.getByRole("button", { name: "Zoom out" }).click();
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
