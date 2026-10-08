import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 1x1 PNG. 브라우저가 WebP로 바꿔 올린다.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function openLibrary(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();
}

test.describe("시설 등록 요청", () => {
  test("사이드패널에서 유형·층·사진을 넣어 보내면 요청과 사진이 접수된다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    await openLibrary(page);

    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "사진은 최대 3장, 장당 4MB까지 올릴 수 있어요",
    );

    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.getByLabel("층 (선택)").fill("3층");
    await dialog.locator('input[type="file"]').setInputFiles([
      { name: "a.png", mimeType: "image/png", buffer: PNG },
      { name: "b.png", mimeType: "image/png", buffer: PNG },
    ]);
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="ready"]'),
    ).toHaveCount(2);

    const submit = dialog.getByRole("button", { name: "요청 보내기" });
    await expect(submit).toBeEnabled();
    // 공개 지도의 주요 버튼은 크림슨이다(피드백 제출과 같다).
    await expect(submit).toHaveCSS("background-color", "rgb(140, 0, 0)");
    await submit.click();

    await expect(dialog.getByRole("status")).toContainText("요청을 보냈어요");
    // 보낸 뒤에는 같은 안내가 부제와 본문에 겹쳐 보이지 않는다.
    await expect(
      dialog.getByText("관리자가 확인한 뒤 지도에 올라가요"),
    ).toHaveCount(1);
    expect(state.facilityRequests).toHaveLength(1);
    expect(state.facilityRequests[0]).toMatchObject({
      building_id: 1,
      facility_code: "elevator",
      floor_info: "3층",
      turnstile_token: expect.stringMatching(/^e2e-turnstile-token-\d+$/),
    });
    expect(state.facilityRequestPhotos).toHaveLength(2);
  });

  test("유형을 고르지 않으면 보내지 않고 안내한다", async ({ page }) => {
    const state = await installMockBackend(page);
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "시설 유형을 골라 주세요",
    );
    expect(state.facilityRequests).toHaveLength(0);
  });

  test("빈도 초과 응답을 번역 문구로 보이고 다시 보낼 수 있게 한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    const tokens: string[] = [];
    await page.route("**/api/facility-requests", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      tokens.push(route.request().postDataJSON().turnstileToken);
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: '{"error":"rate_limited"}',
      });
    });
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "요청이 많아요. 잠시 후 다시 시도해 주세요",
    );
    const submit = dialog.getByRole("button", { name: "요청 보내기" });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(() => tokens.length).toBe(2);
    expect(tokens[1]).not.toBe(tokens[0]);
  });

  async function fillWithPhotos(
    page: import("@playwright/test").Page,
    count: number,
  ) {
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await dialog.getByLabel("시설 유형 *").selectOption("elevator");
    await dialog.locator('input[type="file"]').setInputFiles(
      Array.from({ length: count }, (_, i) => ({
        name: `p${i}.png`,
        mimeType: "image/png",
        buffer: PNG,
      })),
    );
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="ready"]'),
    ).toHaveCount(count);
    return dialog;
  }

  test("사진별로 진행을 보이고, 실패한 사진만 다시 올린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    let posts = 0;
    await page.route("**/api/facility-requests/*/photos", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (posts === 2)
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"error":"server"}',
        });
      return route.fallback();
    });
    const dialog = await fillWithPhotos(page, 3);

    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="uploading"]'),
    ).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: "실패한 사진 다시 올리기" }),
    ).toBeVisible();
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="failed"]'),
    ).toHaveCount(1);
    await expect(
      dialog.locator('.ku-request-photo-slot[data-status="done"]'),
    ).toHaveCount(2);
    expect(posts).toBe(3);

    await dialog
      .getByRole("button", { name: "실패한 사진 다시 올리기" })
      .click();
    await expect(dialog.getByRole("status")).toContainText("요청을 보냈어요");
    expect(posts).toBe(4);
    expect(state.facilityRequestPhotos).toHaveLength(3);
  });

  test("업로드 토큰이 거절되면 남은 사진을 올리지 않고 안내한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    let posts = 0;
    await page.route("**/api/facility-requests/*/photos", (route) => {
      posts += 1;
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: '{"error":"token"}',
      });
    });
    const dialog = await fillWithPhotos(page, 3);
    await dialog.getByRole("button", { name: "요청 보내기" }).click();
    await expect(dialog.getByRole("status")).toContainText("요청을 보냈어요");
    await expect(dialog.getByRole("status")).toContainText(
      "시간이 지나 사진을 더 올릴 수 없어요",
    );
    expect(posts).toBe(1);
  });
});
