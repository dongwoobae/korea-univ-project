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
