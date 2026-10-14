import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("명소 관리자 CRUD", () => {
  test("사진을 선택한 신규 명소를 한 번에 저장하고 삭제한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("button", { name: "+ 명소 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("예: 다람쥐길").fill("E2E 포토존");
    await dialog.getByPlaceholder("명소 설명").fill("학생회관 앞 포토존");
    // 이모지는 피커에서 고른다. 기본값이 들어와 있는지까지 본다.
    const iconButton = dialog.getByLabel(/이모지 \*/);
    await expect(iconButton).toHaveText("✨");
    await iconButton.click();
    await dialog
      .getByLabel("이모지 검색")
      .fill("플래시를 터트리고 있는 카메라");
    await dialog
      .getByRole("option", { name: "플래시를 터트리고 있는 카메라" })
      .click();
    await expect(iconButton).toHaveText("📸");
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
    expect(
      state.landmarks.find((landmark) => landmark.name === "E2E 포토존")?.icon,
    ).toBe("📸");

    const row = page.getByText("E2E 포토존").locator("xpath=../..");
    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByText("명소를 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText("E2E 포토존")).toHaveCount(0);
  });

  test("명소를 검색하고 사진 유무로 필터링한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("searchbox", { name: "명소 검색" }).fill("Squirrel");
    await expect(page.getByText("다람쥐길")).toBeVisible();
    await page.getByLabel("명소 사진 필터").selectOption("without-photo");
    await expect(page.getByText("조건에 맞는 명소가 없어요")).toBeVisible();
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.getByText("다람쥐길")).toBeVisible();
  });

  test("명소를 서버 페이지 단위로 조회하고 모바일에서 이동한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.landmarks.push(
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `landmark-${index + 2}`,
        name: `추가 명소 ${String(index + 1).padStart(2, "0")}`,
        name_en: `Extra landmark ${index + 1}`,
        description: "페이지네이션 검증용 명소",
        icon: "📍",
        lat: 37.5895,
        lng: 127.0322,
        photo_url: null,
        created_at: "2026-07-21T00:00:00Z",
        updated_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      })),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/landmarks");

    await expect(
      page.getByRole("status", { name: "총 21개 중 현재 20개 표시" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "1 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "2 페이지" }).click();
    await expect(
      page.getByRole("status", { name: "총 21개 중 현재 1개 표시" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
    await page.getByRole("button", { name: "이전" }).click();
    await expect(
      page.getByRole("button", { name: "1 페이지" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
