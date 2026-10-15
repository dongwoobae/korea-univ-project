import { expect, test, type Page, type Route } from "@playwright/test";
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

test.describe("제보함 — 검토 모달", () => {
  test("층을 고치고 사진 하나를 빼고 승인하면 그 값으로 시설이 생기고 보드에서 옮겨진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);

    await list.first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(dialog.getByLabel("시설 유형 *")).toHaveValue("elevator");
    await dialog.getByLabel("층 정보 (선택)").fill("4층");
    await dialog.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    await dialog.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(dialog).toBeHidden();
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

  test("확인 중으로 표시하고 되돌린다 — 모달은 열린 채고 카드는 열을 옮겼다 돌아온다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });

    await dialog.getByRole("button", { name: "확인 중으로 표시" }).click();
    await expect(
      dialog.getByRole("button", { name: "신규로 되돌리기" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("reviewing");
    await expect(cards(page, "확인 중")).toHaveCount(2);
    await dialog.getByRole("button", { name: "신규로 되돌리기" }).click();
    await expect(
      dialog.getByRole("button", { name: "확인 중으로 표시" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");
    await expect(cards(page, "신규")).toHaveCount(1);
    await expect(cards(page, "확인 중")).toHaveCount(1);
  });

  test("거절은 확인을 거치고, 거절된 요청은 읽기 전용으로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.first().getByRole("button").click();
    await page
      .getByRole("dialog", { name: /등록 요청/ })
      .getByRole("button", { name: "거절" })
      .click();
    await page
      .getByRole("dialog", { name: "이 요청을 거절할까요?" })
      .getByRole("button", { name: "거절" })
      .click();

    await expect(page.getByRole("dialog", { name: /등록 요청/ })).toBeHidden();
    expect(state.facilityRequests[0].status).toBe("rejected");
    expect(
      state.facilityRequestPhotos.filter(
        (p) => p.request_id === state.facilityRequests[0].id,
      ),
    ).toHaveLength(0);

    await expect(cards(page, "처리 완료")).toHaveCount(2);
    await cards(page, "처리 완료").first().getByRole("button").click();
    const readOnly = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(readOnly.getByLabel("시설 유형 *")).toBeDisabled();
    await expect(
      readOnly.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
  });

  test("다른 관리자가 먼저 처리했으면(409) 안내하고 읽기 전용으로 다시 읽는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(dialog.getByLabel("시설 유형 *")).toBeEnabled();
    state.facilityRequests[0].status = "approved";
    await dialog.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(page.getByText("이미 처리된 요청이에요")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "승인하고 등록" }),
    ).toHaveCount(0);
    await expect(dialog.getByText("승인됨")).toBeVisible();
  });

  test("승인이 거절돼도 고치던 값과 사진 선택은 남는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });
    await dialog.getByLabel("층 정보 (선택)").fill("4층");
    await dialog.getByRole("checkbox", { name: "사진 2 공개" }).uncheck();
    state.buildings[0].is_deleted = true;
    await dialog.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(
      page.getByText(
        "삭제된 건물의 요청이에요. 건물을 복구한 뒤 승인해 주세요",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabel("층 정보 (선택)")).toHaveValue("4층");
    await expect(
      dialog.getByRole("checkbox", { name: "사진 2 공개" }),
    ).not.toBeChecked();
    await expect(
      dialog.getByRole("button", { name: "승인하고 등록" }),
    ).toBeEnabled();
    expect(
      state.facilities.some((f) => String(f.id).startsWith("f-approved")),
    ).toBe(false);
  });

  test("볼 수 없는 사진은 공개할 수 없고 승인에서 빠진다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequestPhotos[1].unsigned = true;
    const list = await openInbox(page);
    await list.first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });

    await expect(dialog.getByText("볼 수 없음")).toBeVisible();
    const hidden = dialog.getByRole("checkbox", { name: "사진 2 공개" });
    await expect(hidden).toBeDisabled();
    await expect(hidden).not.toBeChecked();
    await dialog.getByRole("button", { name: "승인하고 등록" }).click();

    await expect(dialog).toBeHidden();
    expect(state.facilityPhotos.map((photo) => photo.storage_path)).toEqual([
      "f-approved-0001/rp-1.webp",
    ]);
  });
});
