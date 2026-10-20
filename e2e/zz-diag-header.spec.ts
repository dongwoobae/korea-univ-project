import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 진단용(병합하지 않는다): 768~899px 헤더 넘침이 글꼴 로드 전후에 어떻게 다른지 잰다.
async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".ku-admin-header")!;
    const w = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) =>
          `${element.textContent?.trim()}=${element.getBoundingClientRect().width.toFixed(1)}`,
      );
    return {
      overflow: header.scrollWidth - header.clientWidth,
      client: header.clientWidth,
      fontsStatus: document.fonts.status,
      pretendard: document.fonts.check(
        '500 13.5px "Pretendard Variable"',
        "로그",
      ),
      brand: w(".ku-admin-brand"),
      nav: w(".ku-admin-nav a"),
      account: w(".ku-admin-account > *:not(.ku-admin-menu)"),
    };
  });
}

test("진단: 태블릿 헤더 폭", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/buildings");
  const logout = page.getByRole("button", { name: "로그아웃", exact: true });
  const out: Record<string, unknown> = {};
  for (const width of [768, 800, 899]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(logout).toBeVisible();
    out[`${width}-before`] = await measure(page);
  }
  await page.evaluate(async () => {
    await document.fonts.load(
      '500 13.5px "Pretendard Variable"',
      "건물독립시설명소경사도제보함로그",
    );
    await document.fonts.load('700 15px "Pretendard Variable"', "관리자 콘솔");
    await document.fonts.load(
      '500 13px "Pretendard Variable"',
      "설정지도보기로그아웃",
    );
    await document.fonts.ready;
  });
  for (const width of [768, 800, 899]) {
    await page.setViewportSize({ width, height: 900 });
    out[`${width}-after`] = await measure(page);
  }
  expect(JSON.stringify(out, null, 1)).toBe("diag");
});
