import { expect, test } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 캠퍼스는 DB `campus` 컬럼이 아니라 `public/campus-boundaries.geojson`과 건물 모양으로 판정한다.
// 공유 픽스처의 중앙도서관은 인문사회계이고, 여기서 자연계 경계 안에 건물 하나를 더한다.
function addNaturalSciencesBuilding(state: MockState) {
  const [lng, lat] = [127.02629, 37.58393];
  const d = 0.0001;
  state.buildings.push({
    ...state.buildings[0],
    id: 2,
    name: "이학관",
    campus: "서울",
    geojson: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [lng - d, lat - d],
            [lng + d, lat - d],
            [lng + d, lat + d],
            [lng - d, lat + d],
            [lng - d, lat - d],
          ],
        ],
      },
    },
  });
}

test.describe("건물 관리 캠퍼스 필터", () => {
  test("캠퍼스를 고르면 그 캠퍼스로 판정된 건물만 남고 초기화가 푼다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addNaturalSciencesBuilding(state);

    await page.goto("/admin/dashboard/buildings");
    const table = page.getByRole("table", { name: "건물 목록" });
    await expect(
      page.getByRole("status", { name: "총 2개 중 현재 2개 표시" }),
    ).toBeVisible();

    const select = page.getByRole("combobox", { name: "캠퍼스 필터" });
    await select.selectOption("자연계");
    await expect(
      page.getByRole("status", { name: "총 1개 중 현재 1개 표시" }),
    ).toBeVisible();
    await expect(table.getByText("이학관", { exact: true })).toBeVisible();
    await expect(table.getByText("중앙도서관", { exact: true })).toBeHidden();

    await select.selectOption("의료원");
    await expect(
      page.getByText("‘의료원’에 해당하는 건물이 없습니다."),
    ).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await expect(
      page.getByRole("status", { name: "총 2개 중 현재 2개 표시" }),
    ).toBeVisible();
    await expect(select).toHaveValue("all");
  });

  test("캠퍼스와 경고 카드 필터는 함께 걸린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addNaturalSciencesBuilding(state);

    await page.goto("/admin/dashboard/buildings");
    const table = page.getByRole("table", { name: "건물 목록" });
    const overview = page.getByRole("group", { name: "관리자 보완 현황" });

    // 이학관만 사진이 없다.
    await overview.getByRole("button", { name: /사진 없음/ }).click();
    await page
      .getByRole("combobox", { name: "캠퍼스 필터" })
      .selectOption("자연계");
    await expect(table.getByText("이학관", { exact: true })).toBeVisible();

    await page
      .getByRole("combobox", { name: "캠퍼스 필터" })
      .selectOption("인문사회계");
    await expect(
      page.getByText("‘인문사회계’·‘사진 없음’에 해당하는 건물이 없습니다."),
    ).toBeVisible();
  });
});
