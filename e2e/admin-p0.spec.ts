import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const MOBILE = { width: 390, height: 844 };

test.describe("관리자 P0 개선 (모바일 메뉴·상태변경 오류)", () => {
  test("모바일 관리자 계정 메뉴에서 설정·지도 보기·로그아웃에 접근한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.setViewportSize(MOBILE);
    await page.goto("/admin/dashboard/buildings");

    const trigger = page.getByRole("button", { name: "계정 메뉴" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = page.getByRole("menu", { name: "계정 메뉴" });
    await expect(
      menu.getByRole("menuitem", { name: "피드백 이메일 설정" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "공개 지도 보기" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "로그아웃" }),
    ).toBeVisible();

    // Escape로 닫힌다
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "계정 메뉴" })).toHaveCount(0);

    // 설정(피드백 이메일) 진입 가능
    await trigger.click();
    await menu.getByRole("menuitem", { name: "피드백 이메일 설정" }).click();
    await expect(
      page.getByText("피드백 이메일 변경", { exact: true }).last(),
    ).toBeVisible();
  });

  test("시설 상태 변경이 실패하면 성공 메시지를 표시하지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route("**/rest/v1/building_facilities**", async (route) => {
      if (route.request().method() === "PATCH")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "update failed" }),
        });
      return route.fallback();
    });
    await page.goto("/admin/buildings/1");

    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
    const status = dialog.getByRole("status", { name: "현재 상태: 설치" });
    const toggle = dialog.getByRole("button", { name: "미설치로 변경" });
    await expect(status).toBeVisible();
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(page.getByText("변경에 실패했어요")).toBeVisible();
    await expect(page.getByText("설치로 변경되었어요")).toHaveCount(0);
    await expect(page.getByText("미설치로 변경되었어요")).toHaveCount(0);
    // 상태가 바뀌지 않고 원복된다
    await expect(status).toBeVisible();
    await expect(toggle).toHaveText("미설치로 변경");
  });

  test("건물 안 시설을 수정해도 동영상이 남는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    await page
      .locator(".ku-facility-row", { hasText: "지하 주차장 진입로" })
      .click();
    const detail = page.getByRole("dialog", { name: "지하 주차장 진입로" });
    await detail.getByRole("button", { name: "수정" }).click();

    const form = page.getByRole("dialog", { name: "시설 수정" });
    await expect(form.getByLabel("시설 이름 (선택)")).toHaveValue(
      "지하 주차장 진입로",
    );
    await form.getByLabel("시설 이름 (선택)").fill("지하 주차장 진입 경사로");
    const updateRequest = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        request.url().includes("/rest/v1/building_facilities") &&
        "facility_code" in (request.postDataJSON() ?? {}),
    );
    await form.getByRole("button", { name: "저장", exact: true }).click();

    const payload = (await updateRequest).postDataJSON() as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("video_url");
    expect(payload.name).toBe("지하 주차장 진입 경사로");
    await expect(page.getByRole("dialog", { name: "시설 수정" })).toHaveCount(
      0,
    );
    await expect(
      page.locator(".ku-facility-row", { hasText: "지하 주차장 진입 경사로" }),
    ).toBeVisible();
    const saved = state.facilities.find(
      (facility) => facility.id === "f-building-video",
    )!;
    expect(saved.name).toBe("지하 주차장 진입 경사로");
    expect(saved.video_url).toBe(
      "https://cdn.example.com/facility-videos/f-building-video/1.mp4",
    );
  });
});
