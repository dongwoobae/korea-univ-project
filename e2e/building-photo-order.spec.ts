import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.2·3.4

function photoRow(id: number, sortOrder: number, caption: string) {
  return {
    id,
    building_id: 1,
    url: `https://cdn.test/building-1-${id}.webp`,
    caption,
    caption_en: null,
    caption_zh: null,
    sort_order: sortOrder,
    created_at: `2026-07-0${id}T00:00:00Z`,
  };
}

/** 건물 1의 사진 세 장. 화면 순서는 정문 → 로비 → 야간이고 올린 순서(id·created_at)와 같다 */
function seedThreePhotos(state: MockState) {
  state.photos.splice(
    0,
    state.photos.length,
    photoRow(1, 0, "정문"),
    photoRow(2, 1, "로비"),
    photoRow(3, 2, "야간"),
  );
}

function photoSection(page: Page) {
  return page.locator("#building-photos");
}

async function expectCaptionOrder(section: Locator, captions: string[]) {
  const inputs = section.getByLabel("사진 설명");
  await expect(inputs).toHaveCount(captions.length);
  for (const [index, caption] of captions.entries())
    await expect(inputs.nth(index)).toHaveValue(caption);
}

test.describe("건물 사진 순서 — 읽기", () => {
  test("관리자 사진 칸은 올린 순서가 아니라 sort_order 순서로 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    // 밤에 찍은 사진을 맨 앞으로 옮겨 둔 상태
    state.photos[0].sort_order = 2;
    state.photos[2].sort_order = 0;

    await page.goto("/admin/buildings/1");

    await expectCaptionOrder(photoSection(page), ["야간", "로비", "정문"]);
  });

  test("공개 상세는 sort_order 순서의 첫 사진을 맨 앞에 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.photos.splice(
      0,
      state.photos.length,
      photoRow(1, 1, "정문"),
      photoRow(2, 0, "열람실"),
    );
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await page.getByRole("button", { name: "사진 크게 보기" }).click();
    const dialog = page.getByRole("dialog", {
      name: "중앙도서관",
      exact: true,
    });
    await expect(dialog).toContainText("1 / 2");
    await expect(dialog).toContainText("열람실");
  });
});
