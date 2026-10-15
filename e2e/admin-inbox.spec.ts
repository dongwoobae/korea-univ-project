import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

type ColumnName = "신규" | "확인 중" | "처리 완료";

function seedRequests(state: MockState) {
  const base = {
    building_id: 1,
    name: null,
    description: null,
    lat: null,
    lng: null,
    created_at: "2026-10-08T00:00:00Z",
    reviewed_at: null,
    facility_id: null,
  };
  state.facilityRequests.push(
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      facility_code: "elevator",
      floor_info: "3층",
      status: "new",
      lat: 37.5894,
      lng: 127.0325,
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000002",
      facility_code: "ramp",
      floor_info: "1층",
      status: "reviewing",
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000003",
      facility_code: "elevator",
      floor_info: "2층",
      status: "rejected",
    },
  );
  state.facilityRequestPhotos.push(
    {
      id: "rp-1",
      request_id: "00000000-0000-4000-8000-000000000001",
      storage_path: "x/1.webp",
      sort_order: 0,
    },
    {
      id: "rp-2",
      request_id: "00000000-0000-4000-8000-000000000001",
      storage_path: "x/2.webp",
      sort_order: 1,
    },
  );
}

function seedFeedback(state: MockState) {
  state.feedbackSubmissions.push(
    {
      id: "fb-1",
      feedback_type: "error",
      content: "중앙도서관 경사로 위치가 틀려요",
      page_url: "https://campus.example/",
      status: "new",
      created_at: "2026-10-08T00:00:00Z",
    },
    {
      id: "fb-2",
      feedback_type: "feature",
      content: "영문 이름도 검색되면 좋겠어요",
      page_url: null,
      status: "reviewing",
      created_at: "2026-10-07T00:00:00Z",
    },
  );
}

const MANY_ID = (n: number) =>
  `00000000-0000-4000-8000-${String(1000 + n).padStart(12, "0")}`;

// n이 클수록 오래된 신규 요청이다(1번이 첫 쪽 맨 위). 층은 "{n}F"다.
function addNewRequest(state: MockState, n: number) {
  state.facilityRequests.push({
    id: MANY_ID(n),
    building_id: 1,
    facility_code: "elevator",
    name: null,
    description: `설명 ${n}`,
    floor_info: `${n}F`,
    lat: null,
    lng: null,
    status: "new",
    created_at: new Date(
      Date.UTC(2026, 9, 10, 12, 0) - n * 60000,
    ).toISOString(),
    reviewed_at: null,
    facility_id: null,
  });
}

function seedManyNew(state: MockState, count: number) {
  for (let n = 1; n <= count; n += 1) addNewRequest(state, n);
}

// 열은 region(이름 = 열 이름), 카드는 그 안 list의 listitem 하나다.
function column(page: Page, name: ColumnName) {
  return page.getByRole("region", { name, exact: true });
}

function cards(page: Page, name: ColumnName) {
  return column(page, name).getByRole("listitem");
}

function cardWithFloor(page: Page, name: ColumnName, n: number) {
  return cards(page, name).filter({ hasText: new RegExp(` ${n}F`) });
}

function kindButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function openInbox(page: Page, search = "") {
  await page.goto(`/admin/dashboard/inbox${search}`);
  return cards(page, "신규");
}

test.describe("제보함 — 보드", () => {
  test("B1: 메뉴 배지는 신규 수고, 카드는 상태별 열로 나뉜다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    await openInbox(page);

    await expect(
      page
        .getByRole("navigation", { name: "관리자 메뉴" })
        .getByRole("link", { name: /제보함/ }),
    ).toContainText("1");
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("엘리베이터");
    await expect(cards(page, "신규").first()).toContainText("사진 2");
    await expect(cards(page, "신규").first()).toContainText("등록 요청");
    await expect(cards(page, "확인 중")).toHaveCount(1);
    await expect(cards(page, "확인 중").first()).toContainText("경사로");
    await expect(cards(page, "처리 완료")).toHaveCount(1);
    await expect(cards(page, "처리 완료").first()).toContainText("거절됨");
    for (const name of ["신규", "확인 중", "처리 완료"] as const) {
      await expect(
        column(page, name).getByTestId("inbox-column-count"),
      ).toHaveText("1");
    }
    await expect(page.getByText("처리 전 2건")).toBeVisible();
  });

  test("B2: 종류 세그먼트는 그 종류만 보이고 주소를 바꾸되 모르는 파라미터는 남긴다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    seedFeedback(state);
    await openInbox(page, "?foo=bar");
    await expect(cards(page, "신규")).toHaveCount(2);

    await kindButton(page, "피드백").click();
    await expect(page).toHaveURL(/tab=feedback/);
    await expect(page).toHaveURL(/foo=bar/);
    await expect(kindButton(page, "피드백")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("오류 제보");
    await expect(cards(page, "신규").first()).not.toContainText("엘리베이터");

    await kindButton(page, "등록 요청").click();
    await expect(page).toHaveURL(/tab=requests/);
    await expect(page).toHaveURL(/foo=bar/);
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("엘리베이터");

    await kindButton(page, "전체").click();
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page).toHaveURL(/foo=bar/);
    await expect(cards(page, "신규")).toHaveCount(2);

    await page.goto("/admin/dashboard/inbox?tab=feedback");
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("오류 제보");
  });

  test("B3: ?building으로 열면 그 건물 요청만 보이고 해제할 수 있다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    seedFeedback(state);
    state.facilityRequests[1].building_id = 2;
    await openInbox(page, "?building=1");

    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("엘리베이터");
    await expect(
      column(page, "확인 중").getByText("비어 있어요"),
    ).toBeVisible();
    await expect(page.getByText("건물로 거름")).toBeVisible();
    await expect(kindButton(page, "전체")).toBeDisabled();
    await expect(kindButton(page, "피드백")).toBeDisabled();

    await page.getByRole("button", { name: "건물 필터 해제" }).click();
    await expect(page).not.toHaveURL(/building=/);
    await expect(cards(page, "확인 중")).toHaveCount(1);
    await expect(page.getByText("건물로 거름")).toHaveCount(0);
    await expect(kindButton(page, "피드백")).toBeEnabled();
  });

  test("B4: 피드백만 실패하면 등록 요청 카드는 그대로고 그 열에 안내와 다시 시도가 뜬다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    seedFeedback(state);
    const failing = (route: Route) =>
      route.fulfill({ status: 500, json: { error: "x" } });
    await page.route("**/api/admin-feedback?*", failing);
    await openInbox(page);

    const fresh = column(page, "신규");
    await expect(fresh.getByText("피드백을 불러오지 못했어요")).toBeVisible();
    await expect(fresh.getByText("등록 요청을 불러오지 못했어요")).toHaveCount(
      0,
    );
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "신규").first()).toContainText("엘리베이터");
    await expect(fresh.getByText("비어 있어요")).toHaveCount(0);
    await expect(fresh.getByTestId("inbox-column-count")).toHaveCount(0);

    await page.unroute("**/api/admin-feedback?*", failing);
    await fresh.getByRole("button", { name: "다시 시도" }).click();
    await expect(fresh.getByText("피드백을 불러오지 못했어요")).toHaveCount(0);
    await expect(cards(page, "신규")).toHaveCount(2);
    await expect(fresh.getByTestId("inbox-column-count")).toHaveText("2");
  });

  test("B5: 더 보기로 21번째 카드를 받고, 보드를 다시 받으면 첫 쪽으로 돌아간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedManyNew(state, 21);
    const firstResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/facility-requests" &&
        response.url().includes("status=new") &&
        response.url().includes("page=1"),
    );
    await openInbox(page);
    const body = (await (await firstResponse).json()) as {
      items: unknown[];
      total: number;
    };
    expect(body.items).toHaveLength(20);
    expect(body.total).toBe(21);

    const fresh = column(page, "신규");
    await expect(cards(page, "신규")).toHaveCount(20);
    await expect(fresh.getByTestId("inbox-column-count")).toHaveText("21");
    await fresh.getByRole("button", { name: "더 보기" }).click();
    await expect(cards(page, "신규")).toHaveCount(21);
    await expect(fresh.getByTestId("inbox-column-count")).toHaveText("21");
    await expect(fresh.getByRole("button", { name: "더 보기" })).toHaveCount(0);

    // 사이에 새 접수가 들어온 채로 보드를 다시 받으면 이어 붙인 쪽을 버리고 첫 쪽으로 돌아간다.
    addNewRequest(state, 22);
    await cardWithFloor(page, "신규", 1).getByRole("button").click();
    await page
      .getByRole("dialog", { name: /등록 요청/ })
      .getByRole("button", { name: "확인 중으로 표시" })
      .click();
    await expect(cardWithFloor(page, "확인 중", 1)).toHaveCount(1);
    await expect(cards(page, "신규")).toHaveCount(20);
    await expect(fresh.getByTestId("inbox-column-count")).toHaveText("21");
    await expect(fresh.getByRole("button", { name: "더 보기" })).toBeVisible();
  });

  test("B6: 보드를 다시 받은 뒤 도착한 낡은 응답은 버려진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedManyNew(state, 21);
    await openInbox(page);
    await expect(cards(page, "신규")).toHaveCount(20);

    // 붙잡는 순간의 응답을 복사해 둔다. 나중에 fallback()하면 그때의 최신 상태로 답해 낡은 응답이 아니게 된다.
    let copying = false;
    let heldRoute: Route | null = null;
    let staleBody = "";
    await page.route("**/api/facility-requests?*page=2*", async (route) => {
      if (copying) return route.fallback();
      copying = true;
      const request = route.request();
      staleBody = await page.evaluate(
        async ({ url, headers }) => (await fetch(url, { headers })).text(),
        { url: request.url(), headers: request.headers() },
      );
      heldRoute = route;
    });
    await column(page, "신규").getByRole("button", { name: "더 보기" }).click();
    await expect.poll(() => heldRoute !== null).toBe(true);
    expect(JSON.parse(staleBody).items).toHaveLength(1);

    // 붙잡힌 21번째 카드는 서버에서 확인 중으로 옮기고, 1번 카드를 화면에서 바꿔 보드를 다시 받게 한다.
    state.facilityRequests.find((row) => row.id === MANY_ID(21))!.status =
      "reviewing";
    await cardWithFloor(page, "신규", 1).getByRole("button").click();
    await page
      .getByRole("dialog", { name: /등록 요청/ })
      .getByRole("button", { name: "확인 중으로 표시" })
      .click();
    await expect(cards(page, "신규")).toHaveCount(19);

    await heldRoute!.fulfill({
      status: 200,
      contentType: "application/json",
      body: staleBody,
    });
    await page.waitForTimeout(300);
    await expect(cards(page, "신규")).toHaveCount(19);
    await expect(cardWithFloor(page, "신규", 21)).toHaveCount(0);
    await expect(
      column(page, "신규").getByTestId("inbox-column-count"),
    ).toHaveText("19");
  });
});

const LEAVE_TITLE = "저장하지 않은 변경사항이 있어요";
const REQUEST_1 = "00000000-0000-4000-8000-000000000001";
const REQUEST_3 = "00000000-0000-4000-8000-000000000003";

function drawerOf(page: Page) {
  return page.getByRole("dialog", { name: /등록 요청/ });
}

function dimOf(page: Page) {
  return page.getByTestId("inbox-drawer-dim");
}

function leaveDialog(page: Page) {
  return page.getByRole("dialog", { name: LEAVE_TITLE });
}

function adminNav(page: Page) {
  return page.getByRole("navigation", { name: "관리자 메뉴" });
}

async function openFirstNew(page: Page) {
  const list = await openInbox(page);
  await list.first().getByRole("button").click();
  const drawer = drawerOf(page);
  await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("elevator");
  return drawer;
}

// 드로어 바깥(왼쪽) 배경을 누른다.
function clickDim(page: Page) {
  return dimOf(page).click({ position: { x: 20, y: 300 } });
}

test.describe("제보함 — 등록 요청 드로어", () => {
  test("R1: 층을 고치고 사진 하나를 빼고 승인하면 시설이 생기고, 드로어는 처리 후 상태로 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    await drawer.getByLabel("층 정보 (선택)").fill("4층");
    await drawer.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    await expect(drawer.getByText("사진 1/2장 공개")).toBeVisible();
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(drawer.getByText("승인되어 시설로 등록됐어요")).toBeVisible();
    await expect(page.getByText("등록했어요!")).toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel("시설 유형 *")).toBeDisabled();
    await expect(
      drawer.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("link", { name: "만들어진 시설 보기 →" }),
    ).toBeVisible();
    const created = state.facilities.find((facility) =>
      String(facility.id).startsWith("f-approved"),
    );
    expect(created).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "4층",
    });
    expect(
      state.facilityPhotos.filter((photo) => photo.facility_id === created!.id),
    ).toHaveLength(1);
    await expect(cards(page, "신규")).toHaveCount(0);
    await expect(column(page, "신규").getByText("비어 있어요")).toBeVisible();
    await expect(cards(page, "처리 완료")).toHaveCount(2);
  });

  test("R2: 확인 중으로 표시하고 되돌린다 — 드로어는 열린 채고 카드는 열을 옮겼다 돌아온다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);

    await drawer.getByRole("button", { name: "확인 중으로 표시" }).click();
    await expect(
      drawer.getByRole("button", { name: "신규로 되돌리기" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("reviewing");
    await expect(cards(page, "확인 중")).toHaveCount(2);
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "신규로 되돌리기" }).click();
    await expect(
      drawer.getByRole("button", { name: "확인 중으로 표시" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "확인 중")).toHaveCount(1);
    await expect(drawer).toBeVisible();
  });

  test("R3: 거절은 인라인 확인을 거치고, Esc 한 번은 확인만 취소하며, 거절된 요청은 읽기 전용으로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    const confirm = drawer.getByRole("group", { name: "거절 확인" });

    await drawer.getByRole("button", { name: "거절" }).click();
    await expect(
      confirm.getByText("거절할까요? 요청 사진은 지워지고 거절됨으로 남아요."),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(confirm).toHaveCount(0);
    expect(state.facilityRequests[0].status).toBe("new");

    await drawer.getByRole("button", { name: "거절" }).click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(drawer).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");

    await drawer.getByRole("button", { name: "거절" }).click();
    await confirm.getByRole("button", { name: "거절" }).click();
    await expect(drawer.getByText("거절된 요청이에요")).toBeVisible();
    await expect(page.getByText("거절했어요")).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("rejected");
    expect(
      state.facilityRequestPhotos.filter(
        (p) => p.request_id === state.facilityRequests[0].id,
      ),
    ).toHaveLength(0);
    await expect(drawer.getByLabel("시설 유형 *")).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(cards(page, "처리 완료")).toHaveCount(2);
    await cards(page, "처리 완료").first().getByRole("button").click();
    const readOnly = drawerOf(page);
    await expect(readOnly.getByLabel("시설 유형 *")).toBeDisabled();
    await expect(
      readOnly.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
  });

  test("R4: 다른 관리자가 먼저 처리했으면(409) 안내하고 읽기 전용으로 다시 읽는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    await expect(drawer.getByLabel("시설 유형 *")).toBeEnabled();
    state.facilityRequests[0].status = "approved";
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(page.getByText("이미 처리된 요청이에요")).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
    await expect(drawer.getByText("승인됨", { exact: true })).toBeVisible();
    await expect(drawer).toBeVisible();
  });

  test("R5: 승인이 거절돼도 고치던 값과 사진 선택은 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    await drawer.getByLabel("층 정보 (선택)").fill("4층");
    await drawer.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    state.buildings[0].is_deleted = true;
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(
      page.getByText(
        "삭제된 건물의 요청이에요. 건물을 복구한 뒤 승인해 주세요",
      ),
    ).toBeVisible();
    await expect(drawer.getByLabel("층 정보 (선택)")).toHaveValue("4층");
    await expect(
      drawer.getByRole("checkbox", { name: "사진 2 공개" }),
    ).not.toBeChecked();
    await expect(
      drawer.getByRole("button", { name: "승인하고 등록" }),
    ).toBeEnabled();
    expect(
      state.facilities.some((f) => String(f.id).startsWith("f-approved")),
    ).toBe(false);
  });

  test("R6: 볼 수 없는 사진은 공개할 수 없고 승인에서 빠진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequestPhotos[1].unsigned = true;
    const drawer = await openFirstNew(page);

    await expect(drawer.getByText("볼 수 없음")).toBeVisible();
    const hidden = drawer.getByRole("checkbox", { name: "사진 2 공개" });
    await expect(hidden).toBeDisabled();
    await expect(hidden).not.toBeChecked();
    await expect(drawer.getByText("사진 1/2장 공개")).toBeVisible();
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(drawer.getByText("승인되어 시설로 등록됐어요")).toBeVisible();
    expect(state.facilityPhotos.map((photo) => photo.storage_path)).toEqual([
      "f-approved-0001/rp-1.webp",
    ]);
  });

  test("R7: 고친 값이 있으면 배경·✕·Esc가 확인을 묻고, 취소하면 드로어와 값이 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    const name = drawer.getByLabel("시설 이름 (선택)");
    await name.fill("고치는 중");

    await clickDim(page);
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(drawer).toBeVisible();
    await expect(name).toHaveValue("고치는 중");

    await page.keyboard.press("Escape");
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(drawer).toBeVisible();
    await expect(name).toHaveValue("고치는 중");

    await drawer.getByRole("button", { name: "닫기" }).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(drawer).toBeHidden();

    // 확인 중으로 표시해도 고치던 값은 남고 확인을 묻지 않는다.
    await cards(page, "신규").first().getByRole("button").click();
    await drawer.getByLabel("시설 이름 (선택)").fill("또 고치는 중");
    await drawer.getByRole("button", { name: "확인 중으로 표시" }).click();
    await expect(
      drawer.getByRole("button", { name: "신규로 되돌리기" }),
    ).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(drawer.getByLabel("시설 이름 (선택)")).toHaveValue(
      "또 고치는 중",
    );
  });

  test("R7: 헤더 링크 — 같은 화면 제보함 링크와 다른 화면 링크가 모두 확인을 묻는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    await drawer.getByLabel("시설 이름 (선택)").fill("고치는 중");

    await adminNav(page)
      .getByRole("link", { name: /제보함/ })
      .click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/dashboard\/inbox/);

    await cards(page, "신규").first().getByRole("button").click();
    await drawer.getByLabel("시설 이름 (선택)").fill("고치는 중");
    await adminNav(page).getByRole("link", { name: "독립 시설" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/inbox/);
    await expect(drawer.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );
    await adminNav(page).getByRole("link", { name: "독립 시설" }).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/facilities/);
  });

  test("R7: 드로어 안 건물 링크와 브라우저 뒤로가기도 확인을 묻는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    await page.goto("/admin/dashboard/buildings");
    await adminNav(page)
      .getByRole("link", { name: /제보함/ })
      .click();
    await cards(page, "신규").first().getByRole("button").click();
    const drawer = drawerOf(page);
    await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("elevator");
    await drawer.getByLabel("시설 이름 (선택)").fill("고치는 중");

    await drawer.getByRole("link", { name: "중앙도서관" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/inbox/);
    await expect(drawer).toBeVisible();

    await page.evaluate(() => window.history.back());
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/inbox/);
    await expect(drawer.getByLabel("시설 이름 (선택)")).toHaveValue(
      "고치는 중",
    );

    await drawer.getByRole("link", { name: "중앙도서관" }).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(page).toHaveURL(/\/admin\/buildings\/1$/);
  });

  test("R7: 고친 값이 없으면 배경과 ✕가 확인 없이 닫는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);

    await clickDim(page);
    await expect(drawer).toBeHidden();
    await expect(leaveDialog(page)).toHaveCount(0);

    await cards(page, "신규").first().getByRole("button").click();
    await drawer.getByRole("button", { name: "닫기" }).click();
    await expect(drawer).toBeHidden();
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("R8: 승인 요청과 번역 요청을 기다리는 동안 Esc·배경·✕로 닫히지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);

    let releaseApprove!: () => void;
    const approveGate = new Promise<void>((resolve) => {
      releaseApprove = resolve;
    });
    let releaseTranslate!: () => void;
    const translateGate = new Promise<void>((resolve) => {
      releaseTranslate = resolve;
    });
    let approveHeld = false;
    let translateHeld = false;
    await page.route("**/api/facility-requests/*/approve", async (route) => {
      approveHeld = true;
      await approveGate;
      await route.fallback();
    });
    await page.route("**/api/translate-facility", async (route) => {
      translateHeld = true;
      await translateGate;
      await route.fallback();
    });

    async function expectNotClosable() {
      await page.keyboard.press("Escape");
      await clickDim(page);
      await drawer.getByRole("button", { name: "닫기" }).click();
      await page.waitForTimeout(200);
      await expect(drawer).toBeVisible();
      await expect(leaveDialog(page)).toHaveCount(0);
    }

    await drawer.getByRole("button", { name: "승인하고 등록" }).click();
    await expect.poll(() => approveHeld).toBe(true);
    await expectNotClosable();

    releaseApprove();
    await expect.poll(() => translateHeld).toBe(true);
    await expect(drawer.getByText("승인되어 시설로 등록됐어요")).toBeVisible();
    await expectNotClosable();

    releaseTranslate();
    await expect(page.getByText("등록했어요!")).toBeVisible();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "닫기" }).click();
    await expect(drawer).toBeHidden();
  });

  test("R9: 상세 첫 조회가 실패하면 안내하고 드로어가 닫힌다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    await page.route(`**/api/facility-requests/${REQUEST_1}`, (route) =>
      route.fulfill({ status: 500, json: {} }),
    );
    const list = await openInbox(page);
    await list.first().getByRole("button").click();

    await expect(page.getByText("요청을 불러오지 못했어요")).toBeVisible();
    await expect(drawerOf(page)).toBeHidden();
  });

  test("R9: 유형을 비우고 승인하면 경고만 뜨고 요청은 나가지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const drawer = await openFirstNew(page);
    let approveRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/approve")) approveRequests += 1;
    });
    await drawer.getByLabel("시설 유형 *").selectOption("");
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(page.getByText("시설 유형을 선택해주세요")).toBeVisible();
    expect(approveRequests).toBe(0);
    await expect(drawer).toBeVisible();
  });

  test("R9: 승인·거절 뒤 사진 정리가 실패하면 경고 토스트가 뜬다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.requestCleanupFails = true;
    const drawer = await openFirstNew(page);
    await drawer.getByRole("button", { name: "승인하고 등록" }).click();
    await expect(
      page.getByText("등록했어요. 요청 사진 정리는 실패해 다시 해야 해요."),
    ).toBeVisible();
    await expect(drawer.getByText("승인되어 시설로 등록됐어요")).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "남은 사진 정리" }),
    ).toBeVisible();

    await drawer.getByRole("button", { name: "닫기" }).click();
    await cards(page, "확인 중").first().getByRole("button").click();
    await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("ramp");
    await drawer.getByRole("button", { name: "거절" }).click();
    await drawer
      .getByRole("group", { name: "거절 확인" })
      .getByRole("button", { name: "거절" })
      .click();
    await expect(
      page.getByText("거절했지만 사진을 지우지 못했어요"),
    ).toBeVisible();
    await expect(drawer.getByText("거절된 요청이에요")).toBeVisible();
  });

  test("R9: 끝 상태 요청의 남은 사진 정리 — 실패하면 남고 성공하면 사라진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequestPhotos.push({
      id: "rp-3",
      request_id: REQUEST_3,
      storage_path: "x/3.webp",
      sort_order: 0,
    });
    let failCleanup = true;
    await page.route("**/api/facility-requests/*/cleanup", (route) =>
      failCleanup
        ? route.fulfill({ status: 500, json: { error: "정리 실패" } })
        : route.fallback(),
    );
    await openInbox(page);
    await cards(page, "처리 완료").first().getByRole("button").click();
    const drawer = drawerOf(page);
    const cleanup = drawer.getByRole("button", { name: "남은 사진 정리" });
    await expect(drawer.getByText("거절된 요청이에요")).toBeVisible();

    await cleanup.click();
    await expect(page.getByText("정리 실패")).toBeVisible();
    await expect(cleanup).toBeVisible();

    failCleanup = false;
    await cleanup.click();
    await expect(page.getByText("남은 사진을 정리했어요")).toBeVisible();
    await expect(cleanup).toHaveCount(0);
    expect(
      state.facilityRequestPhotos.filter((p) => p.request_id === REQUEST_3),
    ).toHaveLength(0);
  });
});

function feedbackDrawerOf(page: Page, name: string) {
  return page.getByRole("dialog", { name, exact: true });
}

function feedbackSegment(drawer: Locator) {
  return drawer.getByRole("group", { name: "처리 상태" });
}

// n이 클수록 오래된 신규 피드백이다. n=0은 가장 새 접수다.
function addNewFeedback(state: MockState, n: number) {
  state.feedbackSubmissions.push({
    id: `fbm-${n}`,
    feedback_type: "error",
    content: `내용 ${n}번`,
    page_url: null,
    status: "new",
    created_at: new Date(
      Date.UTC(2026, 9, 10, 12, 0) - n * 60000,
    ).toISOString(),
  });
}

function feedbackCard(page: Page, name: ColumnName, n: number) {
  return cards(page, name).filter({ hasText: new RegExp(`내용 ${n}번`) });
}

test.describe("제보함 — 피드백 드로어", () => {
  test("F1: 상태 세그먼트를 누르면 바로 저장되고, 드로어는 열린 채 카드가 처리 완료 열로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedFeedback(state);
    await openInbox(page, "?tab=feedback");
    const badge = adminNav(page).getByRole("link", { name: /제보함/ });
    await expect(badge).toContainText("1");

    await cards(page, "신규").first().getByRole("button").click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    const segment = feedbackSegment(drawer);
    await expect(
      segment.getByRole("button", { name: "신규", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await segment.getByRole("button", { name: "처리 완료" }).click();
    await expect(page.getByText("처리 완료로 바꿨어요")).toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(
      segment.getByRole("button", { name: "처리 완료" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(state.feedbackSubmissions[0].status).toBe("resolved");
    await expect(cards(page, "처리 완료")).toHaveCount(1);
    await expect(cards(page, "신규")).toHaveCount(0);
    await expect(badge).not.toContainText("1");

    await segment.getByRole("button", { name: "확인 중" }).click();
    await expect(page.getByText("확인 중으로 바꿨어요")).toBeVisible();
    await segment.getByRole("button", { name: "신규", exact: true }).click();
    await expect(page.getByText("신규로 되돌렸어요")).toBeVisible();
    expect(state.feedbackSubmissions[0].status).toBe("new");
    await expect(cards(page, "신규")).toHaveCount(1);
  });

  test("F2: 전체 본문과 보낸 화면이 보이고, 같은 출처만 링크이며, Esc·배경으로 닫힌다", async ({
    page,
    baseURL,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const sameOriginUrl = `${new URL(baseURL!).origin}/map?x=1`;
    state.feedbackSubmissions.push(
      {
        id: "fb-ext",
        feedback_type: "error",
        content: "첫째 줄\n둘째 줄\n\n넷째 줄",
        page_url: "https://campus.example/map?q=1",
        status: "new",
        created_at: "2026-10-09T00:00:00Z",
      },
      {
        id: "fb-same",
        feedback_type: "feature",
        content: "같은 사이트에서 보냈어요",
        page_url: sameOriginUrl,
        status: "new",
        created_at: "2026-10-08T00:00:00Z",
      },
    );
    await openInbox(page, "?tab=feedback");

    await cards(page, "신규").first().getByRole("button").click();
    const external = feedbackDrawerOf(page, "오류 제보");
    const content = external.getByTestId("feedback-content");
    expect(await content.evaluate((el) => el.textContent)).toBe(
      "첫째 줄\n둘째 줄\n\n넷째 줄",
    );
    await expect(content).toHaveCSS("white-space", "pre-wrap");
    await expect(external).toContainText("보낸 화면");
    await expect(external).toContainText("https://campus.example/map?q=1");
    await expect(
      external.getByRole("link", { name: /campus\.example/ }),
    ).toHaveCount(0);
    await expect(external).toContainText("접수");
    await page.keyboard.press("Escape");
    await expect(external).toBeHidden();

    await cards(page, "신규").nth(1).getByRole("button").click();
    const same = feedbackDrawerOf(page, "기능 제안");
    const link = same.getByRole("link", { name: sameOriginUrl });
    await expect(link).toHaveAttribute("href", sameOriginUrl);
    await expect(link).not.toHaveAttribute("target", "_blank");
    await clickDim(page);
    await expect(same).toBeHidden();
  });

  test("F3: 다음 항목은 같은 열의 다음 카드를 열고, 마지막 카드에는 없다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    for (const n of [1, 2, 3]) addNewFeedback(state, n);
    await openInbox(page, "?tab=feedback");

    await feedbackCard(page, "신규", 1).getByRole("button").click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    const next = drawer.getByRole("button", { name: "다음 항목 →" });
    await expect(drawer.getByTestId("feedback-content")).toHaveText("내용 1번");
    await next.click();
    await expect(drawer.getByTestId("feedback-content")).toHaveText("내용 2번");
    await next.click();
    await expect(drawer.getByTestId("feedback-content")).toHaveText("내용 3번");
    await expect(next).toHaveCount(0);
  });

  test("F3: 상태를 바꿔 보드가 첫 쪽으로 돌아가도 다음 항목은 연 순간의 목록에서 이어진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    for (let n = 1; n <= 21; n += 1) addNewFeedback(state, n);
    await openInbox(page, "?tab=feedback");
    await expect(cards(page, "신규")).toHaveCount(20);
    await column(page, "신규").getByRole("button", { name: "더 보기" }).click();
    await expect(cards(page, "신규")).toHaveCount(21);

    // 사이에 더 새로운 접수가 들어와, 다시 받은 첫 쪽에는 21번째 카드가 들지 못한다.
    addNewFeedback(state, 0);
    await feedbackCard(page, "신규", 20).getByRole("button").click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    const content = drawer.getByTestId("feedback-content");
    await expect(content).toHaveText("내용 20번");
    await feedbackSegment(drawer)
      .getByRole("button", { name: "확인 중" })
      .click();
    await expect(page.getByText("확인 중으로 바꿨어요")).toBeVisible();
    await expect(feedbackCard(page, "확인 중", 20)).toHaveCount(1);
    await expect(feedbackCard(page, "신규", 21)).toHaveCount(0);
    // 상태를 바꿔도 드로어는 그 항목을 들고 있다.
    await expect(content).toHaveText("내용 20번");

    const next = drawer.getByRole("button", { name: "다음 항목 →" });
    await next.click();
    await expect(content).toHaveText("내용 21번");
    await expect(next).toHaveCount(0);
  });

  test("F3: 저장하는 동안 세그먼트와 다음 항목은 막히고 Esc·배경·✕로 닫히지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    for (const n of [1, 2]) addNewFeedback(state, n);
    await openInbox(page, "?tab=feedback");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    await page.route("**/api/admin-feedback/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      held = true;
      await gate;
      await route.fallback();
    });

    await feedbackCard(page, "신규", 1).getByRole("button").click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    const segment = feedbackSegment(drawer);
    const next = drawer.getByRole("button", { name: "다음 항목 →" });
    await segment.getByRole("button", { name: "확인 중" }).click();
    await expect.poll(() => held).toBe(true);

    for (const name of ["신규", "확인 중", "처리 완료"]) {
      await expect(
        segment.getByRole("button", { name, exact: true }),
      ).toBeDisabled();
    }
    await expect(next).toBeDisabled();
    await page.keyboard.press("Escape");
    await clickDim(page);
    await drawer.getByRole("button", { name: "닫기" }).click();
    await page.waitForTimeout(200);
    await expect(drawer).toBeVisible();

    release();
    await expect(page.getByText("확인 중으로 바꿨어요")).toBeVisible();
    await expect(
      segment.getByRole("button", { name: "확인 중" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(next).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("F3: 상태를 바꾸지 못하면 오류 토스트가 뜨고 상태는 그대로다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedFeedback(state);
    await page.route("**/api/admin-feedback/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "fail" }),
      });
    });
    await openInbox(page, "?tab=feedback");
    await cards(page, "신규").first().getByRole("button").click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    await feedbackSegment(drawer)
      .getByRole("button", { name: "처리 완료" })
      .click();
    await expect(page.getByText("상태를 바꾸지 못했어요")).toBeVisible();
    await expect(
      feedbackSegment(drawer).getByRole("button", {
        name: "신규",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(state.feedbackSubmissions[0].status).toBe("new");
  });
});

function mobileList(page: Page) {
  return page.getByRole("list", { name: "제보 목록" });
}

function mobileCards(page: Page) {
  return mobileList(page).getByRole("listitem");
}

function mobileChip(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

// 상세 전체 화면이 헤더(54) 아래, 하단 nav(58) 위에 정확히 놓였는지 본다.
async function expectFullScreenDetail(drawer: Locator) {
  const box = await drawer.boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.width).toBe(390);
  expect(box!.y).toBe(54);
  expect(box!.y + box!.height).toBe(844 - 58);
}

async function expectTouchTarget(button: Locator) {
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe("제보함 — 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("M1: 종류 세그먼트에 개수가 보이고, 상태 칩·세그먼트로 목록이 바뀌며, 카드는 전체 화면 상세를 연다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    seedFeedback(state);
    addNewFeedback(state, 1);
    await page.goto("/admin/dashboard/inbox");

    await expect(kindButton(page, "등록 요청 2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(kindButton(page, "피드백 3")).toBeVisible();
    await expect(mobileChip(page, "처리 전")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(mobileCards(page)).toHaveCount(2);
    // 모바일은 열이 없는 한 목록이다
    await expect(page.getByRole("region", { name: "신규" })).toHaveCount(0);

    await mobileChip(page, "처리 완료").click();
    await expect(mobileCards(page)).toHaveCount(1);
    await expect(mobileCards(page).first()).toContainText("거절됨");
    await expect(kindButton(page, "등록 요청 1")).toBeVisible();
    await expect(kindButton(page, "피드백 0")).toBeVisible();

    await kindButton(page, "피드백 0").click();
    await expect(page).toHaveURL(/tab=feedback/);
    await expect(page.getByText("조건에 맞는 항목이 없어요")).toBeVisible();
    await mobileChip(page, "처리 전").click();
    await expect(mobileCards(page)).toHaveCount(3);
    await expect(mobileCards(page).first()).toContainText("오류 제보");

    await kindButton(page, "등록 요청 2").click();
    await expect(page).toHaveURL(/tab=requests/);
    await mobileCards(page).first().getByRole("button").click();
    const drawer = drawerOf(page);
    await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("elevator");
    await expectFullScreenDetail(drawer);
    await expect(dimOf(page)).toHaveCount(0);

    await drawer.getByRole("button", { name: "뒤로" }).click();
    await expect(drawer).toBeHidden();
    await expect(mobileCards(page)).toHaveCount(2);
  });

  test("M2: 등록 요청 상세 하단 바는 거절·승인이고, 데스크톱과 같은 로직으로 승인된다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    await page.goto("/admin/dashboard/inbox");
    await mobileCards(page).first().getByRole("button").click();
    const drawer = drawerOf(page);
    await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("elevator");

    const reject = drawer.getByRole("button", { name: "거절", exact: true });
    const approve = drawer.getByRole("button", { name: "승인하고 등록" });
    await expectTouchTarget(reject);
    await expectTouchTarget(approve);
    const rejectBox = (await reject.boundingBox())!;
    const approveBox = (await approve.boundingBox())!;
    expect(approveBox.width).toBeGreaterThan(rejectBox.width);
    expect(approveBox.y + approveBox.height).toBeLessThanOrEqual(844 - 58);

    const confirm = drawer.getByRole("group", { name: "거절 확인" });
    await reject.click();
    await expect(confirm).toBeVisible();
    await expect(approve).toHaveCount(0);
    await expectTouchTarget(confirm.getByRole("button", { name: "취소" }));
    await confirm.getByRole("button", { name: "취소" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(approve).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");

    await drawer.getByLabel("층 정보 (선택)").fill("4층");
    await drawer.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    await expect(drawer.getByText("사진 1/2장 공개")).toBeVisible();
    const map = drawer.locator(".leaflet-container");
    await map.scrollIntoViewIfNeeded();
    const mapBox = (await map.boundingBox())!;
    expect(mapBox.height).toBe(190);
    await map.click({ position: { x: 60, y: 50 } });
    await expect(drawer.getByText("지도에서 고른 위치예요")).toBeVisible();

    await approve.click();
    await expect(drawer.getByText("승인되어 시설로 등록됐어요")).toBeVisible();
    await expect(page.getByText("등록했어요!")).toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel("시설 유형 *")).toBeDisabled();
    const created = state.facilities.find((facility) =>
      String(facility.id).startsWith("f-approved"),
    );
    expect(created).toMatchObject({ floor_info: "4층" });
    expect(Number(created!.lat)).not.toBeCloseTo(37.5894, 4);
    expect(Number(created!.lng)).not.toBeCloseTo(127.0325, 4);
    expect(
      state.facilityPhotos.filter((photo) => photo.facility_id === created!.id),
    ).toHaveLength(1);
  });

  test("M2: 값을 고친 채 뒤로를 누르면 확인을 묻고, 취소하면 상세가 남는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    await page.goto("/admin/dashboard/inbox");
    await mobileCards(page).first().getByRole("button").click();
    const drawer = drawerOf(page);
    const name = drawer.getByLabel("시설 이름 (선택)");
    await name.fill("고치는 중");

    await drawer.getByRole("button", { name: "뒤로" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "취소" }).click();
    await expect(drawer).toBeVisible();
    await expect(name).toHaveValue("고치는 중");

    await drawer.getByRole("button", { name: "뒤로" }).click();
    await leaveDialog(page).getByRole("button", { name: "나가기" }).click();
    await expect(drawer).toBeHidden();
  });

  test("M3: 피드백 상세는 하단 상태 세그먼트로 바로 저장하고 다음 항목이 없다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedFeedback(state);
    await page.goto("/admin/dashboard/inbox?tab=feedback");
    await mobileCards(page)
      .filter({ hasText: "중앙도서관" })
      .getByRole("button")
      .click();
    const drawer = feedbackDrawerOf(page, "오류 제보");
    await expectFullScreenDetail(drawer);
    const segment = feedbackSegment(drawer);
    for (const label of ["신규", "확인 중", "처리 완료"]) {
      await expectTouchTarget(
        segment.getByRole("button", { name: label, exact: true }),
      );
    }
    await expect(drawer.getByRole("button", { name: /다음 항목/ })).toHaveCount(
      0,
    );

    await segment.getByRole("button", { name: "처리 완료" }).click();
    await expect(page.getByText("처리 완료로 바꿨어요")).toBeVisible();
    expect(state.feedbackSubmissions[0].status).toBe("resolved");
    await expect(drawer).toBeVisible();
    await expect(
      segment.getByRole("button", { name: "처리 완료" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
