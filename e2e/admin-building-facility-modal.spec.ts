import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물 상세 시설 모달", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
  });

  test("행을 누르면 시설명이 제목인 모달이 열린다", async ({ page }) => {
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toBeVisible();
  });

  test("정상 시설 행에는 배지가 없고 손봐야 할 행에만 붙는다", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: /중앙 엘리베이터/ }),
    ).not.toContainText("미설치");
    await expect(
      page.getByRole("button", { name: /후문 경사로/ }),
    ).toContainText("미설치");
    await expect(
      page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
    ).toContainText("번역 필요");
  });

  test("모달에서 상태를 토글하면 목록 배지가 따라 바뀐다", async ({ page }) => {
    const row = page.getByRole("button", { name: /중앙 엘리베이터/ });
    await row.click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
    await dialog.getByRole("button", { name: "미설치로 변경" }).click();
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(row).toContainText("미설치");
  });

  test("모달을 닫으면 포커스가 열었던 행으로 돌아온다", async ({ page }) => {
    const row = page.getByRole("button", { name: /중앙 엘리베이터/ });
    await row.click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(row).toBeFocused();
  });

  test("ESC로 모달을 닫아도 포커스가 열었던 행으로 돌아온다", async ({
    page,
  }) => {
    const row = page.getByRole("button", { name: /중앙 엘리베이터/ });
    await row.click();
    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test("모달에서 시설을 삭제하면 모달이 닫히고 포커스가 시설 추가로 간다", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "삭제" })
      .click();
    const confirm = page.getByRole("dialog", { name: "시설을 삭제할까요?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "삭제", exact: true }).click();

    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ 시설 추가" }),
    ).toBeFocused();
  });

  test("동영상이 있는 시설의 삭제 확인창은 동영상도 지워진다고 알린다", async ({
    page,
  }) => {
    // 동영상이 있는 시설은 `건물 동영상` 섹션에도 `<이름> 동영상 관리` 버튼으로
    // 나온다. 이름만으로 집으면 두 개가 잡히므로 시설 현황 카드로 좁힌다.
    await page
      .locator("#building-facilities")
      .getByRole("button", { name: /지하 주차장 진입로/ })
      .click();
    await page
      .getByRole("dialog", { name: "지하 주차장 진입로" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      page.getByText("이 시설의 동영상도 함께 삭제됩니다"),
    ).toBeVisible();
  });

  test("동영상이 없는 시설의 삭제 확인창에는 그 문구가 없다", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "삭제" })
      .click();
    await expect(
      page.getByText("이 시설의 동영상도 함께 삭제됩니다"),
    ).toHaveCount(0);
  });

  test("번역 필요 건수를 헤더에 드러내고 일괄 재번역하면 배지가 사라진다", async ({
    page,
  }) => {
    const bulk = page.getByRole("button", { name: /전부 재번역/ });
    await expect(bulk).toContainText("번역 필요 1건");
    await bulk.click();
    await expect(
      page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
    ).not.toContainText("번역 필요");
    await expect(bulk).toHaveCount(0);
  });

  test("번역이 다시 실패하면 배지가 그대로 남는다", async ({ page }) => {
    await page.route("**/api/translate", (route) =>
      route.fulfill({ status: 500, json: { error: "translate failed" } }),
    );

    await page.getByRole("button", { name: /전부 재번역/ }).click();

    await expect(page.getByText("1건은 다시 실패했어요")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
    ).toContainText("번역 필요");
    await expect(
      page.getByRole("button", { name: /전부 재번역/ }),
    ).toBeVisible();
  });
});
