import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { serverError } from "./support/adminWorkspace";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장·4.2

const FACILITIES_PATH = "/admin/dashboard/facilities";
const UNUSED = {
  code: "type_unused01",
  label: "안 쓰는 종류",
  label_en: null,
  label_zh: null,
  icon: "info",
  color: "#475569",
  sort_order: 4,
};

function listPanel(page: Page) {
  return page.getByRole("region", { name: "독립 시설", exact: true });
}

async function openTypesModal(page: Page) {
  await listPanel(page).getByRole("button", { name: "종류 관리" }).click();
  const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function typeRow(dialog: Locator, label: string) {
  return dialog.locator(".ku-types-modal-row").filter({
    has: dialog
      .page()
      .locator(".ku-types-modal-label")
      .getByText(label, { exact: true }),
  });
}

async function expectLabels(dialog: Locator, labels: string[]) {
  await expect(dialog.locator(".ku-types-modal-label")).toHaveText(labels);
}

function moveButton(
  dialog: Locator,
  label: string,
  direction: "위로" | "아래로",
) {
  return dialog.getByRole("button", {
    name: `${label} ${direction} 옮기기`,
    exact: true,
  });
}

function toast(page: Page, role: "status" | "alert", text: string) {
  return page.locator(`.ku-toast[role='${role}']`).filter({ hasText: text });
}

function isRequest(method: string, path: string) {
  return (request: Request) =>
    request.method() === method &&
    new URL(request.url()).pathname.endsWith(path);
}

function typeByCode(state: MockState, code: string) {
  return state.facilityTypes.find((type) => type.code === code)!;
}

async function expectTouchTarget(
  control: Locator,
  frame?: { x: number; width: number },
) {
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  if (frame) {
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
  }
}

test.describe("시설 종류 관리 — 목록", () => {
  test("순서대로 종류와 번역 이름, 쓰는 시설 수를 보여 주고 닫으면 버튼으로 돌아간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    const ramp = typeRow(dialog, "경사로");
    await expect(ramp).toContainText("Ramp · 坡道");
    await expect(ramp).toContainText("시설 2곳이 이 종류를 써요");
    await expect(
      ramp.getByRole("button", { name: "경사로 삭제" }),
    ).toBeDisabled();

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      listPanel(page).getByRole("button", { name: "종류 관리" }),
    ).toBeFocused();
  });

  test("사용 현황을 받지 못하면 삭제를 모두 끄고 다시 시도할 수 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    let failUsage = true;
    await page.route("**/api/facility-types/usage", (route) =>
      failUsage ? serverError(route) : route.fallback(),
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    const alert = dialog
      .getByRole("alert")
      .filter({ hasText: "사용 현황을 불러오지 못했어요" });
    await expect(alert).toBeVisible();
    for (const label of ["엘리베이터", "경사로", "장애인 주차"])
      await expect(
        dialog.getByRole("button", { name: `${label} 삭제` }),
      ).toBeDisabled();

    failUsage = false;
    await alert.getByRole("button", { name: "다시 시도" }).click();
    await expect(alert).toBeHidden();
    await expect(typeRow(dialog, "경사로")).toContainText(
      "시설 2곳이 이 종류를 써요",
    );
  });
});

test.describe("시설 종류 관리 — 추가·수정", () => {
  test("자동번역·아이콘·색으로 새 종류를 추가하면 맨 뒤에 붙고 공개 필터에도 나온다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await expect(
      dialog.getByRole("heading", { name: "종류 추가" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("한국어 이름")).toBeFocused();

    await dialog.getByLabel("한국어 이름").fill("수유실");
    await dialog.getByRole("button", { name: "자동번역 채우기" }).click();
    await expect(dialog.getByLabel("영어 이름")).toHaveValue("EN 수유실");
    await expect(dialog.getByLabel("중국어 이름")).toHaveValue("ZH 수유실");
    await dialog.getByTitle("수유·기저귀", { exact: true }).click();
    await expect(
      dialog.getByRole("radio", { name: "수유·기저귀" }),
    ).toBeChecked();
    await dialog.getByTitle("분홍", { exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "분홍" })).toBeChecked();

    const preview = dialog.getByRole("group", { name: "미리보기" });
    await expect(preview.locator(".ku-types-form-preview-marker")).toHaveCSS(
      "background-color",
      "rgb(190, 24, 93)",
    );
    await expect(preview.locator(".ku-types-form-preview-chip")).toContainText(
      "수유실",
    );
    await expect(preview.locator("svg.lucide-baby")).toHaveCount(2);

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    await expectLabels(dialog, [
      "엘리베이터",
      "경사로",
      "장애인 주차",
      "수유실",
    ]);
    await expect(typeRow(dialog, "수유실")).toContainText("쓰는 시설 없음");
    const created = state.facilityTypes.at(-1)!;
    expect(created).toMatchObject({
      label: "수유실",
      label_en: "EN 수유실",
      label_zh: "ZH 수유실",
      icon: "baby",
      color: "#BE185D",
      sort_order: 4,
    });
    expect(String(created.code)).toMatch(/^type_[a-z0-9]{8}$/);

    await page.goto("/");
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /수유실/ }).locator("svg.lucide-baby"),
    ).toHaveCount(1);
  });

  test("빈 영어·중국어 칸은 NULL로 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await dialog.getByLabel("한국어 이름").fill("휴게실");
    await dialog.getByLabel("영어 이름").fill("   ");
    const insert = page.waitForRequest(
      isRequest("POST", "/rest/v1/facility_types"),
    );
    await dialog.getByRole("button", { name: "저장" }).click();

    expect((await insert).postDataJSON()).toMatchObject({
      label: "휴게실",
      label_en: null,
      label_zh: null,
      icon: "accessibility",
      color: "#666666",
    });
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    expect(state.facilityTypes.at(-1)).toMatchObject({
      label_en: null,
      label_zh: null,
    });
  });

  test("이름이 비었거나 다른 종류와 같으면 보내지 않고 알린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const inserts: string[] = [];
    page.on("request", (request) => {
      if (isRequest("POST", "/rest/v1/facility_types")(request))
        inserts.push(request.url());
    });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "한국어 이름을 적어 주세요",
    );
    await dialog.getByLabel("한국어 이름").fill(" 경사로 ");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "같은 이름의 종류가 있어요",
    );
    expect(inserts).toHaveLength(0);
  });

  test("자동번역이 실패하면 칸을 비운 채 알리고 저장은 막지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
    await dialog.getByLabel("한국어 이름").fill("샤워실");
    await dialog.getByRole("button", { name: "자동번역 채우기" }).click();

    await expect(toast(page, "status", "자동번역에 실패했어요")).toBeVisible();
    await expect(dialog.getByLabel("영어 이름")).toHaveValue("");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "status", "종류를 추가했어요")).toBeVisible();
    expect(state.facilityTypes.at(-1)).toMatchObject({
      label: "샤워실",
      label_en: null,
    });
  });

  test("이름을 고치면 공개 지도 캐시를 비우고, 닫은 뒤 시설 목록의 종류 이름이 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await typeRow(dialog, "경사로")
      .getByRole("button", { name: "경사로 수정" })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "종류 수정 — 경사로" }),
    ).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "주황" })).toBeChecked();

    await dialog.getByLabel("한국어 이름").fill("완만한 경사로");
    const revalidate = page.waitForRequest(
      isRequest("POST", "/api/revalidate-facilities"),
    );
    await dialog.getByRole("button", { name: "저장" }).click();
    await revalidate;
    await expect(toast(page, "status", "종류를 고쳤어요")).toBeVisible();
    expect(typeByCode(state, "ramp")).toMatchObject({ label: "완만한 경사로" });
    await expectLabels(dialog, ["엘리베이터", "완만한 경사로", "장애인 주차"]);

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(
      listPanel(page).getByRole("button", { name: /중앙광장 경사로/ }),
    ).toContainText("완만한 경사로 ·");
    await expect(
      page
        .getByLabel("시설 유형 필터")
        .locator("option", { hasText: "완만한 경사로" }),
    ).toHaveCount(1);
  });
});

test.describe("시설 종류 관리 — 삭제", () => {
  test("쓰는 시설이나 검토 대기 요청이 있으면 삭제를 끄고 이유를 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    state.facilityRequests.push(
      {
        id: "00000000-0000-4000-8000-000000000101",
        building_id: 1,
        facility_code: UNUSED.code,
        status: "reviewing",
        created_at: "2026-10-20T00:00:00Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        building_id: 1,
        facility_code: UNUSED.code,
        status: "approved",
        created_at: "2026-10-19T00:00:00Z",
      },
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText(
      "검토 대기 요청 1건이 이 종류로 들어왔어요",
    );
    await expect(
      unused.getByRole("button", { name: `${UNUSED.label} 삭제` }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "장애인 주차 삭제" }),
    ).toBeDisabled();
  });

  test("아무도 쓰지 않는 종류를 지우면 목록에서 빠지고 공개 지도 캐시를 비운다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText("쓰는 시설 없음");

    await unused.getByRole("button", { name: `${UNUSED.label} 삭제` }).click();
    const revalidate = page.waitForRequest(
      isRequest("POST", "/api/revalidate-facilities"),
    );
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await revalidate;

    await expect(toast(page, "status", "종류를 삭제했어요")).toBeVisible();
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    expect(state.facilityTypes.map((type) => type.code)).not.toContain(
      UNUSED.code,
    );
    // 지운 줄의 버튼이 사라져도 초점은 종류 관리 모달 안에 남는다
    await expect(dialog.locator(":focus")).toHaveCount(1);
  });

  test("유형 필터로 고른 종류를 지우면 필터가 모든 유형으로 돌아간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const filter = page.getByLabel("시설 유형 필터");
    await filter.selectOption(UNUSED.code);
    await expect(listPanel(page).getByRole("status")).toHaveText("0개 표시");

    const dialog = await openTypesModal(page);
    await typeRow(dialog, UNUSED.label)
      .getByRole("button", { name: `${UNUSED.label} 삭제` })
      .click();
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(toast(page, "status", "종류를 삭제했어요")).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();

    await expect(filter).toHaveValue("all");
    await expect(listPanel(page).getByRole("status")).toHaveText("2개 표시");
  });

  test("센 뒤에 그 종류로 시설이 생기면 지우지 않고 알린 뒤 수를 다시 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityTypes.push({ ...UNUSED });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    const unused = typeRow(dialog, UNUSED.label);
    await expect(unused).toContainText("쓰는 시설 없음");
    // 다른 관리자가 그사이 이 종류로 시설을 등록했다
    state.facilities.push({
      ...state.facilities[0],
      id: "f-race",
      facility_code: UNUSED.code,
    });

    await unused.getByRole("button", { name: `${UNUSED.label} 삭제` }).click();
    await page
      .getByRole("dialog", { name: "종류를 삭제할까요?" })
      .getByRole("button", { name: "삭제", exact: true })
      .click();

    await expect(
      toast(
        page,
        "status",
        "그사이 이 종류를 쓰는 시설이 생겨 지우지 못했어요",
      ),
    ).toBeVisible();
    await expect(unused).toContainText("시설 1곳이 이 종류를 써요");
    await expect(
      unused.getByRole("button", { name: `${UNUSED.label} 삭제` }),
    ).toBeDisabled();
    expect(state.facilityTypes.map((type) => type.code)).toContain(UNUSED.code);
    await expect.poll(() => state.activityReports.length).toBe(1);
    expect(state.activityReports[0]).toMatchObject({
      action: "facility_types.delete",
      target_table: "facility_types",
      target_id: UNUSED.code,
    });
  });
});

test.describe("시설 종류 관리 — 순서", () => {
  test("▲▼로 이웃 종류와 자리를 바꾸고 화면 순서대로 저장해 다시 열어도 그 순서다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    let dialog = await openTypesModal(page);
    await expect(moveButton(dialog, "엘리베이터", "위로")).toBeDisabled();
    await expect(moveButton(dialog, "장애인 주차", "아래로")).toBeDisabled();

    await moveButton(dialog, "장애인 주차", "위로").click();
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    await expect
      .poll(() => state.facilityTypeSwapRequests)
      .toEqual([{ p_first: "ramp", p_second: "parking" }]);

    await page.reload();
    dialog = await openTypesModal(page);
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
  });

  test("키보드로 옮기면 초점이 옮긴 종류의 화살표를 따라간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await moveButton(dialog, "경사로", "아래로").focus();
    await page.keyboard.press("Enter");
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    // 경사로가 맨 끝에 닿아 아래로가 꺼지므로 같은 종류의 위로로 간다
    await expect(moveButton(dialog, "경사로", "위로")).toBeFocused();

    await expect(moveButton(dialog, "경사로", "위로")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Enter");
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    await expect(moveButton(dialog, "경사로", "위로")).toBeFocused();
    await expect
      .poll(() => state.facilityTypeSwapRequests)
      .toEqual([
        { p_first: "ramp", p_second: "parking" },
        { p_first: "parking", p_second: "ramp" },
      ]);
  });

  test("저장 중에는 화살표를 모두 잠근다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let swapCalls = 0;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/rpc/swap_facility_type_order"),
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        swapCalls += 1;
        await held;
        await route.fallback();
      },
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);

    await moveButton(dialog, "장애인 주차", "위로").click();
    // 저장이 끝나기 전에 화면이 먼저 바뀐다
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    for (const [label, direction] of [
      ["엘리베이터", "아래로"],
      ["장애인 주차", "위로"],
      ["장애인 주차", "아래로"],
      ["경사로", "위로"],
    ] as const)
      await expect(moveButton(dialog, label, direction)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    await moveButton(dialog, "엘리베이터", "아래로").click({ force: true });

    release();
    await expect(
      moveButton(dialog, "엘리베이터", "아래로"),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(swapCalls).toBe(1);
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
  });

  test("순서를 바꾼 뒤 목록을 다시 받지 못하면 알리고 다시 받을 때까지 고치지 못하게 한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let failTypeReads = false;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/facility_types"),
      (route) =>
        failTypeReads && route.request().method() === "GET"
          ? serverError(route)
          : route.fallback(),
    );
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    failTypeReads = true;

    await moveButton(dialog, "장애인 주차", "위로").click();
    const alert = dialog
      .getByRole("alert")
      .filter({ hasText: "종류 목록을 새로 불러오지 못했어요" });
    await expect(alert).toBeVisible();
    expect(typeByCode(state, "parking").sort_order).toBe(2);
    await expect(
      dialog.getByRole("button", { name: "＋ 종류 추가" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "경사로 수정" }),
    ).toBeDisabled();
    await expect(moveButton(dialog, "경사로", "위로")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    failTypeReads = false;
    await alert.getByRole("button", { name: "다시 시도" }).click();
    await expect(alert).toBeHidden();
    await expectLabels(dialog, ["엘리베이터", "장애인 주차", "경사로"]);
    await expect(
      dialog.getByRole("button", { name: "＋ 종류 추가" }),
    ).toBeEnabled();
  });

  test("다른 관리자가 그사이 순서를 바꿨으면 다시 불러오고 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto(FACILITIES_PATH);
    const dialog = await openTypesModal(page);
    await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
    // 다른 관리자가 엘리베이터와 경사로를 바꿨다. 이 화면은 아직 모른다
    typeByCode(state, "elevator").sort_order = 2;
    typeByCode(state, "ramp").sort_order = 1;

    // (경사로, 장애인 주차) — 지금 둘 사이에 엘리베이터가 있다
    await moveButton(dialog, "장애인 주차", "위로").click();

    await expect(
      toast(page, "status", "순서가 바뀌어 다시 불러왔어요"),
    ).toBeVisible();
    await expectLabels(dialog, ["경사로", "엘리베이터", "장애인 주차"]);
    expect(state.activityReports).toHaveLength(0);
  });

  for (const failure of [
    { status: 403, code: "42501", reason: "forbidden" },
    { status: 500, code: "XX000", reason: "server_error" },
  ]) {
    test(`그 밖의 실패(${failure.code})는 순서를 되돌리고 오류로 알리며 실패를 보고한다`, async ({
      page,
    }) => {
      const state = await installMockBackend(page, { authenticated: true });
      await page.route(
        (url) => url.pathname.endsWith("/rest/v1/rpc/swap_facility_type_order"),
        (route) =>
          route.request().method() !== "POST"
            ? route.fallback()
            : route.fulfill({
                status: failure.status,
                headers: { "access-control-allow-origin": "*" },
                contentType: "application/json",
                body: JSON.stringify({
                  code: failure.code,
                  message: "swap failed",
                  details: null,
                  hint: null,
                }),
              }),
      );
      await page.goto(FACILITIES_PATH);
      const dialog = await openTypesModal(page);

      await moveButton(dialog, "장애인 주차", "위로").click();

      await expect(
        toast(page, "alert", "종류 순서를 바꾸지 못했어요"),
      ).toBeVisible();
      await expectLabels(dialog, ["엘리베이터", "경사로", "장애인 주차"]);
      await expect.poll(() => state.activityReports.length).toBe(1);
      expect(state.activityReports[0]).toMatchObject({
        action: "facility_types.update",
        reason_code: failure.reason,
        target_table: "facility_types",
        target_id: "parking",
      });
    });
  }
});

test("모바일 폭에서 종류 관리 조작이 44px 터치 영역을 갖고 모달 안에 든다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(FACILITIES_PATH);
  await listPanel(page).getByRole("button", { name: "목록 펼치기" }).click();
  const open = listPanel(page).getByRole("button", { name: "종류 관리" });
  await expectTouchTarget(open);
  await open.click();
  const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
  await expect(typeRow(dialog, "경사로")).toContainText(
    "시설 2곳이 이 종류를 써요",
  );
  const frame = (await dialog.boundingBox())!;

  const row = typeRow(dialog, "경사로");
  for (const control of [
    moveButton(dialog, "경사로", "위로"),
    moveButton(dialog, "경사로", "아래로"),
    row.getByRole("button", { name: "경사로 수정" }),
    row.getByRole("button", { name: "경사로 삭제" }),
    dialog.getByRole("button", { name: "＋ 종류 추가" }),
    dialog.getByRole("button", { name: "닫기" }),
  ])
    await expectTouchTarget(control, frame);

  await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
  for (const control of [
    dialog.getByTitle("휠체어", { exact: true }),
    dialog.getByTitle("회색", { exact: true }),
    dialog.getByRole("button", { name: "자동번역 채우기" }),
    dialog.getByRole("button", { name: "뒤로" }),
    dialog.getByRole("button", { name: "저장" }),
  ])
    await expectTouchTarget(control, frame);
});
