import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("시설 사진", () => {
  test("공개 사이드패널에 시설 사진 썸네일이 보이고 누르면 라이트박스로 열린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    // sort_order 0이 더 늦게 올라온 사진이다: 표시 순서는 업로드 순서를 따른다.
    state.facilityPhotos.push(
      {
        id: "fp2",
        facility_id: "f-building",
        storage_path: "f-building/b.webp",
        sort_order: 0,
        created_at: "2026-10-02T00:00:00Z",
      },
      {
        id: "fp1",
        facility_id: "f-building",
        storage_path: "f-building/a.webp",
        sort_order: 1,
        created_at: "2026-10-01T00:00:00Z",
      },
    );

    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    const first = page.getByRole("button", {
      name: "중앙 엘리베이터 사진 1",
      exact: true,
    });
    await expect(first).toBeVisible();
    await expect(
      page.getByRole("button", { name: "중앙 엘리베이터 사진 2", exact: true }),
    ).toBeVisible();

    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "중앙 엘리베이터 사진 1" }),
    ).toHaveAttribute(
      "src",
      /\/storage\/v1\/object\/public\/facility-photos\/f-building\/a\.webp$/,
    );
    await expect(dialog).toContainText("1 / 2");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });
});

test.describe("관리자 시설 사진", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  test("관리자 시설 상세에서 사진을 추가하고 지운다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });

    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
    await expect(
      dialog.getByRole("button", { name: "사진 1 삭제" }),
    ).toBeVisible();
    expect(
      state.facilityPhotos.filter(
        (photo) => photo.facility_id === "f-building",
      ),
    ).toHaveLength(1);

    await dialog.getByRole("button", { name: "사진 1 삭제" }).click();
    await page
      .getByRole("dialog", { name: "사진을 삭제할까요?" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      dialog.getByRole("button", { name: "사진 1 삭제" }),
    ).toHaveCount(0);
    expect(state.facilityPhotos).toHaveLength(0);
  });

  test("사진 칸은 업로드 순서로 보이고 3장이면 추가 칸이 사라진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    // sort_order 0이 더 늦게 올라온 사진이다.
    state.facilityPhotos.push(
      {
        id: "fp2",
        facility_id: "f-building",
        storage_path: "f-building/b.webp",
        sort_order: 0,
        created_at: "2026-10-02T00:00:00Z",
      },
      {
        id: "fp1",
        facility_id: "f-building",
        storage_path: "f-building/a.webp",
        sort_order: 1,
        created_at: "2026-10-01T00:00:00Z",
      },
    );
    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });

    await expect(dialog.getByRole("img", { name: "사진 1" })).toHaveAttribute(
      "src",
      /\/facility-photos\/f-building\/a\.webp$/,
    );
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: "c.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("img", { name: "사진 3" })).toHaveAttribute(
      "src",
      /\/facility-photos\/f-building\/up-3\.webp$/,
    );
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  });

  test("건물 상세에 그 건물의 검토 대기 요청 수가 보이고 제보함으로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityRequests.push({
      id: "00000000-0000-4000-8000-000000000001",
      building_id: 1,
      facility_code: "elevator",
      status: "new",
      created_at: "2026-10-08T00:00:00Z",
      facility_id: null,
    });
    await page.goto("/admin/buildings/1");
    await page.getByRole("link", { name: "검토 대기 요청 1건" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/inbox\?building=1$/);
  });
});
