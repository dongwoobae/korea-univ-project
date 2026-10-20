import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 진단용(병합하지 않는다): 대체 글꼴로만 그린 768~899px 헤더가 넘치는지, 메뉴 여백을 줄이면 사라지는지 잰다.
async function overflowAt(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".ku-admin-header")!;
    const style = getComputedStyle(header);
    return {
      overflow: header.scrollWidth - header.clientWidth,
      padding: `${style.paddingLeft}/${style.paddingRight}`,
      nav: Array.from(
        document.querySelectorAll<HTMLElement>(".ku-admin-nav a"),
      ).map((a) => a.getBoundingClientRect().width.toFixed(1)),
      account: Array.from(
        document.querySelectorAll<HTMLElement>(
          ".ku-admin-account > *:not(.ku-admin-menu)",
        ),
      ).map((e) => e.getBoundingClientRect().width.toFixed(1)),
      brand: document
        .querySelector<HTMLElement>(".ku-admin-brand")!
        .getBoundingClientRect()
        .width.toFixed(1),
    };
  });
}

test("진단: 대체 글꼴의 태블릿 헤더", async ({ page }) => {
  await page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/buildings");
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
  const out: Record<string, unknown> = {};
  for (const width of [768, 800, 899])
    out[`fallback-${width}`] = await overflowAt(page, width);
  await page.addStyleTag({
    content:
      "@media (min-width: 768px) and (max-width: 899px) { .ku-admin-nav a { padding: 0 12px; } }",
  });
  for (const width of [768, 800, 899])
    out[`fallback-pad12-${width}`] = await overflowAt(page, width);
  expect(JSON.stringify(out)).toBe("diag");
});
