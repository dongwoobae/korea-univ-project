import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물과 경사도 관리자 흐름", () => {
  test("건물 생성 필수값을 검증하고 폴리곤을 그려 저장한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page.getByText("건물 이름을 입력해주세요")).toBeVisible();

    await page.getByPlaceholder("예: 신공학관").fill("E2E 신관");
    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(
      page.getByText("폴리곤을 그려주세요", { exact: true }),
    ).toBeVisible();

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    await expect(map).toHaveClass(/geoman-draw-cursor/);
    const points = [
      { x: 350, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 250 },
      { x: 350, y: 250 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[0] });

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("✅ 폴리곤 준비 완료")).toBeVisible();
    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page).toHaveURL(/admin\/buildings\/-\d+$/);
    expect(
      state.buildings.some((building) => building.name === "E2E 신관"),
    ).toBeTruthy();
  });

  test("건물명 수정과 소프트 삭제·복원을 수행한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const nameCard = page.getByText("건물명 수정").locator("..");
    await nameCard.locator("input").first().fill("중앙도서관 E2E");
    await nameCard.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("건물명이 저장되었어요!")).toBeVisible();
    expect(state.buildings[0].name).toBe("중앙도서관 E2E");

    await page.getByRole("button", { name: "건물 삭제" }).click();
    await page.getByText(/건물을 삭제 처리할까요/).waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "복구", exact: true }).click();
    await expect(page.getByRole("button", { name: /건물 복구/ })).toBeVisible();

    await page.getByRole("button", { name: /건물 복구/ }).click();
    await expect(page.getByRole("button", { name: "건물 삭제" })).toBeVisible();
  });

  test("잘못된 GPX를 오류 메시지와 함께 거부한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const input = page.locator("#gpx-input");

    await input.setInputFiles({
      name: "broken.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from("<gpx><broken>"),
    });
    let invalidMessage = "";
    const dismissed = page.waitForEvent("dialog").then(async (dialog) => {
      invalidMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "업로드 & 저장" }).click();
    await dismissed;
    expect(invalidMessage).toContain("GPX 파일을 파싱할 수 없습니다");
  });

  test("정상 GPX를 등록·다운로드·삭제한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const input = page.locator("#gpx-input");
    const validGpx = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="37.5890" lon="127.0320"><ele>20</ele></trkpt>
      <trkpt lat="37.5892" lon="127.0322"><ele>22</ele></trkpt>
    </trkseg></trk></gpx>`;
    await input.setInputFiles({
      name: "E2E-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(validGpx),
    });
    await page.getByRole("button", { name: "업로드 & 저장" }).click();
    await expect(page.getByText("E2E-route", { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    const routeRow = page
      .getByText("E2E-route", { exact: true })
      .locator("xpath=../..");
    await routeRow.getByRole("button", { name: "다운로드" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("E2E-route.gpx");

    page.once("dialog", (dialog) => dialog.accept());
    await routeRow.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText("E2E-route", { exact: true })).toHaveCount(0);
  });
});
