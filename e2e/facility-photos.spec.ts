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
