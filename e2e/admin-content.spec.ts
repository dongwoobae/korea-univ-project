import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("독립 시설과 명소 관리자 CRUD", () => {
  test("독립 시설을 현재 위치에 생성하고 상태 변경 후 삭제한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption("ramp");
    await dialog.getByPlaceholder("예: 정문 엘리베이터").fill("E2E 경사로");
    await dialog.getByTitle("현재 위치로 이동").click();
    await expect(dialog.getByText(/선택된 위치:/)).toBeVisible();
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("E2E 경사로")).toBeVisible();
    expect(
      state.facilities.some((facility) => facility.name === "E2E 경사로"),
    ).toBeTruthy();

    const row = page.getByText("E2E 경사로").locator("xpath=../..");
    await row.getByRole("button", { name: "설치" }).click();
    await expect(row.getByRole("button", { name: "미설치" })).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "E2E 경사로")
        ?.is_installed,
    ).toBe(false);

    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByText("시설을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText("E2E 경사로")).toHaveCount(0);
  });

  test("시설 동영상을 업로드하고 캡션 저장 후 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
    await row.getByRole("button", { name: "동영상" }).click();
    await expect(page.getByText("동영상 관리")).toBeVisible();

    await page.locator('input[type="file"][accept^="video/"]').setInputFiles({
      name: "ramp.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake video"),
    });
    await expect(page.locator("video")).toBeVisible();

    const caption = page.getByPlaceholder("동영상 설명 추가...");
    await caption.fill("정문 방향 경사로 영상");
    await caption.blur();
    await expect
      .poll(
        () =>
          state.facilities.find((facility) => facility.id === "f-installed")
            ?.video_caption,
      )
      .toBe("정문 방향 경사로 영상");

    await page.getByRole("button", { name: "동영상 삭제" }).click();
    await page.getByText("동영상을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText(/동영상 추가/)).toBeVisible();
  });

  test("사진을 선택한 신규 명소를 한 번에 저장하고 삭제한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("button", { name: "+ 명소 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("예: 다람쥐길").fill("E2E 포토존");
    await dialog.getByPlaceholder("명소 설명").fill("학생회관 앞 포토존");
    await dialog.locator('input[maxlength="4"]').fill("📸");
    await dialog.getByTitle("현재 위치로 이동").click();
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "photo.webp",
      mimeType: "image/webp",
      buffer: Buffer.from("fake image"),
    });
    await expect(dialog.getByText("저장 시 업로드: photo.webp")).toBeVisible();
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("E2E 포토존")).toBeVisible();
    await expect(page.getByText("사진 있음").last()).toBeVisible();
    expect(
      state.landmarks.find((landmark) => landmark.name === "E2E 포토존")
        ?.photo_url,
    ).toContain("uploaded-landmark");

    const row = page.getByText("E2E 포토존").locator("xpath=../..");
    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByText("명소를 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText("E2E 포토존")).toHaveCount(0);
  });
});
