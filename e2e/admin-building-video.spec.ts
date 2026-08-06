import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물 동영상 섹션", () => {
  test("동영상이 있는 시설을 목록에 보여준다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await expect(section).toContainText("지하 주차장 진입로");
    await expect(section).toContainText("진입로 경사");
  });

  test("시설을 고르면 업로드 모달이 열린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await section.getByRole("button", { name: "+ 동영상 추가" }).click();
    await section
      .getByRole("combobox", { name: "동영상을 추가할 시설" })
      .selectOption({ label: "중앙 엘리베이터" });
    await section.getByRole("button", { name: "확인" }).click();

    await expect(page.getByRole("dialog", { name: /동영상/ })).toBeVisible();
  });

  test("이미 동영상이 있는 시설을 고르면 교체 경고가 뜬다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await section.getByRole("button", { name: "+ 동영상 추가" }).click();
    await section
      .getByRole("combobox", { name: "동영상을 추가할 시설" })
      .selectOption({ label: "지하 주차장 진입로" });

    await expect(section).toContainText("기존 동영상이 교체됩니다");
  });

  test("미설치 시설의 동영상에 공개 안 됨 표시가 붙는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find(
      (item) => item.id === "f-building-video",
    );
    if (facility) facility.is_installed = false;
    await page.goto("/admin/buildings/1");

    await expect(page.locator("#building-videos")).toContainText("공개 안 됨");
  });

  test("시설이 없는 건물에서는 동영상 추가가 비활성이다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilities = state.facilities.filter(
      (item) => item.building_id !== 1,
    );
    await page.goto("/admin/buildings/1");

    await expect(
      page.locator("#building-videos").getByRole("button", {
        name: "+ 동영상 추가",
      }),
    ).toBeDisabled();
  });
});
