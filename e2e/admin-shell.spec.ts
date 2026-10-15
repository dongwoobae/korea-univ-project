import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("관리자 셸", () => {
  test("헤더는 데스크톱 60px, 모바일 54px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    const header = page.locator(".ku-admin-header");
    await expect(header).toHaveCSS("height", "60px");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(header).toHaveCSS("height", "54px");
  });

  test("헤더 오른쪽 버튼은 높이 34px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    for (const name of ["설정", "지도 보기", "로그아웃"]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
        name,
      ).toHaveCSS("height", "34px");
    }
  });

  test("태블릿 폭(768~899px)에서도 헤더가 넘치지 않고 로그아웃이 화면 안에 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    const header = page.locator(".ku-admin-header");
    const logout = page.getByRole("button", { name: "로그아웃", exact: true });

    for (const width of [768, 800, 899]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(logout, `${width}px`).toBeVisible();
      const overflow = await header.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      expect(overflow, `${width}px 헤더 넘침`).toBeLessThanOrEqual(0);
      const box = (await logout.boundingBox())!;
      expect(
        box.x + box.width,
        `${width}px 로그아웃 오른쪽 끝`,
      ).toBeLessThanOrEqual(width);
    }
    // 이메일은 이 폭에서만 숨긴다. 넓은 데스크톱에서는 그대로 보인다
    await expect(page.locator(".ku-admin-email")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator(".ku-admin-email")).toBeVisible();
  });

  // .ku-admin-content 전역 덮어쓰기가 없어져도 건물 카드 모양이 그대로인지 지킨다.
  test("건물 화면 카드 버튼의 반경은 8px이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await expect(
      page.locator("button.ku-admin-overview-item").first(),
    ).toHaveCSS("border-radius", "8px");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".ku-admin-mobile-card").first()).toHaveCSS(
      "border-radius",
      "8px",
    );
  });
});

test.describe("토스트 모양", () => {
  test("관리자 토스트는 아래 가운데에 반전 색으로 뜨고 3초 뒤 사라진다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");
    await page.getByRole("button", { name: "건물 저장" }).click();

    const toast = page.locator(".ku-toast[role='alert']");
    await expect(toast).toContainText("건물 이름을 입력해주세요");
    await expect(toast).toHaveCSS("background-color", "rgb(28, 25, 23)");
    await expect(toast).toHaveCSS("color", "rgb(255, 255, 255)");
    // 종류는 색이 아니라 아이콘 모양으로 가른다(설계 2026-10-14 2.12)
    await expect(toast.locator("svg.lucide-circle-x")).toHaveCount(1);
    const box = (await toast.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(viewport.height - box.y - box.height)).toBe(28);
    expect(Math.round(box.x + box.width / 2)).toBe(viewport.width / 2);

    await expect(toast).toHaveCount(0, { timeout: 4000 });
  });

  test("공개 지도 토스트는 위 가운데의 지금 모양 그대로다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(
            _success: PositionCallback,
            error: PositionErrorCallback,
          ) {
            error({
              code: 1,
              PERMISSION_DENIED: 1,
            } as GeolocationPositionError);
          },
        },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "현 위치" }).click();

    const toast = page.locator(".ku-toast[role='alert']");
    await expect(toast).toContainText("위치 권한이 거부되었어요");
    await expect(toast).toHaveCSS("background-color", "rgb(254, 242, 242)");
    const box = (await toast.boundingBox())!;
    expect(Math.round(box.y)).toBe(24);
  });
});
