import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("관리자 캠퍼스 영역 안내", () => {
  test("캠퍼스 밖 독립 시설에 경고하되 저장은 허용한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.61, longitude: 127.06 },
    });
    await page.goto("/admin/dashboard/facilities");

    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption("ramp");
    await dialog
      .getByPlaceholder("예: 정문 엘리베이터")
      .fill("인접 지역 경사로");
    await dialog.getByRole("button", { name: "현 위치로 찍기" }).click();

    await expect(
      dialog.getByText(
        "캠퍼스 영역 밖입니다. 인접 지역 시설이라면 그대로 저장할 수 있습니다.",
      ),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.facilities).toHaveLength(4);
    expect(state.facilities.at(-1)).toMatchObject({
      name: "인접 지역 경사로",
      lat: 37.61,
      lng: 127.06,
    });
  });
});
