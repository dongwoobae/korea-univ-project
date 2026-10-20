import { expect, test, type Page } from "@playwright/test";
import { activityLogRow, installMockBackend } from "./support/mockBackend";

/** 설계: docs/specs/2026-10-19-activity-log-design.md 5장, 8.2 */

const logList = (page: Page) => page.getByRole("list", { name: "로그 목록" });

test.describe("관리자 로그", () => {
  test("헤더의 로그 탭으로 들어가 최신순 한 줄 요약을 본다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "로그" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/logs$/);

    const rows = logList(page).getByRole("button");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("10/19 14:02");
    await expect(rows.nth(0)).toContainText("info");
    await expect(rows.nth(0)).toContainText("성웅");
    await expect(rows.nth(0)).toContainText("시설 · 하나스퀘어 · 1층 경사로");
    await expect(rows.nth(0)).toContainText(
      "수정: 설치 여부 설치됨 → 미설치 외 2칸",
    );
    await expect(rows.nth(1)).toContainText("자동 번역");
    await expect(rows.nth(2)).toContainText(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    await expect(rows.nth(3)).toContainText("삭제");
    await expect(rows.nth(4)).toContainText("2025/12/01 12:00");
    await expect(rows.nth(4)).toContainText("건물 · 옛 학생회관");
  });

  test("유형 드롭다운으로 거르고 주소에 남긴다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await expect(logList(page).getByRole("button")).toHaveCount(5);

    await page
      .getByRole("combobox", { name: "로그 유형" })
      .selectOption("error");
    await expect(page).toHaveURL(/\?level=error$/);
    await expect(logList(page).getByRole("button")).toHaveCount(1);
    await expect(logList(page)).toContainText("시설 사진 업로드 실패");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "로그 유형" })).toHaveValue(
      "error",
    );
    await expect(logList(page).getByRole("button")).toHaveCount(1);
  });

  test("더 보기로 다음 50건을 이어 붙인다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.activityLogs.push(
      ...Array.from({ length: 60 }, (_, index) =>
        activityLogRow({
          id: 100 + index,
          occurred_at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
          target_table: "landmarks",
          target_label: `명소 ${index}`,
          changes: { name: [`명소 ${index}`, `명소 ${index}!`] },
        }),
      ),
    );
    await page.goto("/admin/dashboard/logs");
    await expect(logList(page).getByRole("button")).toHaveCount(50);
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect(logList(page).getByRole("button")).toHaveCount(65);
    await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);
  });

  test("행을 누르면 수정 전후 표가 열리고 Esc로 닫으면 행으로 돌아간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    const row = logList(page).getByRole("button").first();
    await row.click();

    const dialog = page.getByRole("dialog", {
      name: "시설 · 하나스퀘어 · 1층 경사로",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("columnheader", { name: "이전" }),
    ).toBeVisible();
    const installed = dialog.getByRole("row", { name: /설치 여부/ });
    await expect(installed).toContainText("설치됨");
    await expect(installed).toContainText("미설치");
    await expect(dialog.getByRole("row", { name: /설명/ })).toContainText(
      "(비어 있음)",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test("삭제 기록은 지워진 값 표를 보인다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await logList(page).getByRole("button").nth(3).click();
    const dialog = page.getByRole("dialog", { name: "명소 · 분수대" });
    await expect(
      dialog.getByRole("columnheader", { name: "지워진 값" }),
    ).toBeVisible();
    await expect(dialog.getByRole("row", { name: /이름/ })).toContainText(
      "분수대",
    );
  });

  test("실패 기록은 사유와 접힌 원문을 보이고, 늦게 들어온 기록은 두 시각을 보인다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await logList(page).getByRole("button").nth(2).click();
    const dialog = page.getByRole("dialog", {
      name: "시설 · 중앙광장 · 승강기",
    });
    await expect(dialog).toContainText(
      "시설 사진 업로드 실패: 파일 5.2MB가 서버 한도 4.5MB를 넘음",
    );
    await expect(dialog).toContainText("사유 코드: payload_too_large");
    await expect(dialog).toContainText("기록된 시각");

    const raw = dialog.locator("pre");
    await expect(raw).toBeHidden();
    await dialog.getByText("원문(개발자용)").click();
    await expect(raw).toContainText("FUNCTION_PAYLOAD_TOO_LARGE");
  });

  test("좁은 화면에서는 카드 목록으로 바뀐다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    const cards = logList(page).getByRole("button");
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toContainText("시설 · 하나스퀘어 · 1층 경사로");
    await expect(page.locator(".ku-log-head")).toHaveCount(0);
  });

  test("관리자 API가 Vercel 504로 끝나면 실패를 보고한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.route("**/api/settings/feedback-emails", (route) =>
      route.fulfill({
        status: 504,
        headers: { "x-vercel-error": "FUNCTION_INVOCATION_TIMEOUT" },
        body: "An error occurred with your deployment",
      }),
    );
    await page.goto("/admin/dashboard/facilities");
    await page.getByRole("button", { name: "설정" }).click();
    await page.locator("input").first().fill("accessibility@example.com");
    await page.getByRole("button", { name: "저장" }).click();

    await expect.poll(() => state.activityReports.length).toBeGreaterThan(0);
    expect(state.activityReports[0]).toMatchObject({
      owner_user_id: "admin-user",
      action: "settings.feedback_emails",
      reason_code: "timeout",
      level: "error",
      detail: { status: 504, code: "FUNCTION_INVOCATION_TIMEOUT" },
    });
  });
});
