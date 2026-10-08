import { expect, test, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

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

async function openInbox(page: Page) {
  await page.goto("/admin/dashboard/inbox");
  return page.getByRole("list", { name: "등록 요청 목록" });
}

test.describe("제보함 — 등록 요청 목록", () => {
  test("메뉴 배지는 신규 수, 기본 목록은 신규·확인 중이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);

    await expect(
      page
        .getByRole("navigation", { name: "관리자 메뉴" })
        .getByRole("link", { name: /제보함/ }),
    ).toContainText("1");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText(
      "엘리베이터",
    );
    await expect(list.getByRole("listitem").first()).toContainText("사진 2");
    await expect(list.getByRole("listitem").first()).toContainText("신규");
  });

  test("상태 필터로 처리 완료와 전체를 본다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    const filter = page.getByRole("combobox", { name: "상태 필터" });

    await filter.selectOption("done");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem")).toContainText("거절됨");
    await filter.selectOption("all");
    await expect(list.getByRole("listitem")).toHaveCount(3);
  });

  test("?building으로 열면 그 건물 요청만 보이고 해제할 수 있다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequests[1].building_id = 2;
    await page.goto("/admin/dashboard/inbox?building=1");
    const list = page.getByRole("list", { name: "등록 요청 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "건물 필터 해제" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
  });
});

test.describe("제보함 — 검토 모달", () => {
  test("층을 고치고 사진 하나를 빼고 승인하면 그 값으로 시설이 생기고 목록에서 빠진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);

    await list.getByRole("listitem").first().getByRole("button").click();
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
    await expect(list.getByRole("listitem")).toHaveCount(1);
  });

  test("확인 중으로 표시하고 되돌린다 — 모달은 열린 채다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: /등록 요청/ });

    await dialog.getByRole("button", { name: "확인 중으로 표시" }).click();
    await expect(
      dialog.getByRole("button", { name: "신규로 되돌리기" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("reviewing");
    await dialog.getByRole("button", { name: "신규로 되돌리기" }).click();
    await expect(
      dialog.getByRole("button", { name: "확인 중으로 표시" }),
    ).toBeVisible();
    expect(state.facilityRequests[0].status).toBe("new");
  });

  test("거절은 확인을 거치고, 거절된 요청은 읽기 전용으로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
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

    await page
      .getByRole("combobox", { name: "상태 필터" })
      .selectOption("done");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await list.getByRole("listitem").first().getByRole("button").click();
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
    await list.getByRole("listitem").first().getByRole("button").click();
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

  test("볼 수 없는 사진은 공개할 수 없고 승인에서 빠진다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedRequests(state);
    state.facilityRequestPhotos[1].unsigned = true;
    const list = await openInbox(page);
    await list.getByRole("listitem").first().getByRole("button").click();
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
