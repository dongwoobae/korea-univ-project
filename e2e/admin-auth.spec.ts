import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("관리자 인증과 공통 기능", () => {
  test("비로그인 사용자를 로그인 화면으로 보낸다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/admin/dashboard/facilities");

    await expect(page).toHaveURL("http://127.0.0.1:3100/admin");
    await expect(page.getByText("관리자 로그인")).toBeVisible();
  });

  test("잘못된 로그인 정보를 안내한다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/admin");

    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrong");
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(
      page.getByText("이메일 또는 비밀번호가 올바르지 않아요"),
    ).toBeVisible();
  });

  test("로그인 후 대시보드에 진입하고 로그아웃한다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/admin");

    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page.getByText("모두의 캠퍼스 — 관리자")).toBeVisible();
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/admin");
  });

  test("피드백 수신 이메일을 변경한다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/admin");
    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('input[type="password"]').fill("secret");
    await page.getByRole("button", { name: "로그인" }).click();
    await page.getByRole("link", { name: /독립 시설/ }).click();

    await page.getByRole("button", { name: /피드백 이메일 변경/ }).click();
    await expect(
      page.getByText("피드백 이메일 변경", { exact: true }).last(),
    ).toBeVisible();
    const input = page.locator("input").first();
    await input.fill("accessibility@example.com");
    await page.getByRole("button", { name: "저장" }).click();

    await expect(
      page.getByText("피드백 이메일 변경", { exact: true }),
    ).toHaveCount(0);
  });
});
