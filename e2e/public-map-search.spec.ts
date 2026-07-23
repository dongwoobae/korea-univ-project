import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// UX-P1-04: 통합 검색(건물 + 명소) · 접근성 콤보박스
test.describe("공개 지도 통합 검색 · 콤보박스", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
  });

  test("한글 UI에서 영어 이름 부분일치로 건물을 찾는다", async ({ page }) => {
    await page.goto("/");

    // 기본 한국어 UI에서 name_en("Central Library")의 부분 문자열을 입력
    await page.getByPlaceholder("건물 검색...").fill("Library");

    // 3필드 검색 증명: 한국어 표시명으로 결과가 노출된다
    await expect(
      page.getByRole("option", { name: /중앙도서관/ }),
    ).toBeVisible();
  });

  test("명소가 통합 결과로 나오고 클릭 시 건물 패널을 열지 않는다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("다람쥐길");

    const landmarkOption = page.locator(
      '.ku-search-result[data-kind="landmark"]',
    );
    await expect(landmarkOption).toBeVisible();
    // 명소임을 시각적으로 구분: "명소" 태그
    await expect(landmarkOption.getByText("명소", { exact: true })).toBeVisible();

    await landmarkOption.click();

    // 리스트가 닫히고, 건물 사이드 패널은 열리지 않는다
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
  });

  test("키보드로 옵션을 이동하고 Enter로 선택한다", async ({ page }) => {
    // 2개 이상의 결과를 얻기 위해 건물 2개를 반환하도록 override (공유 픽스처는 유지)
    const poly = (dx: number) => ({
      type: "Polygon",
      coordinates: [
        [
          [127.032 + dx, 37.589],
          [127.0324 + dx, 37.589],
          [127.0324 + dx, 37.5894],
          [127.032 + dx, 37.5894],
          [127.032 + dx, 37.589],
        ],
      ],
    });
    await page.route("**/api/buildings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: poly(0),
              properties: { id: 1, name: "중앙도서관", name_en: "Central Library" },
            },
            {
              type: "Feature",
              geometry: poly(0.001),
              properties: { id: 2, name: "중앙광장", name_en: "Central Plaza" },
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    const input = page.getByPlaceholder("건물 검색...");
    await input.fill("중앙");
    await expect(page.getByRole("option")).toHaveCount(2);

    // ArrowDown → 첫 옵션 활성 + aria-activedescendant 연결
    await input.press("ArrowDown");
    const firstOption = page.getByRole("option").first();
    await expect(firstOption).toHaveAttribute("aria-selected", "true");
    const firstId = await firstOption.getAttribute("id");
    await expect(input).toHaveAttribute("aria-activedescendant", firstId ?? "");

    // ArrowDown → 두 번째 옵션 활성
    await input.press("ArrowDown");
    await expect(page.getByRole("option").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Enter → 활성(두 번째, 중앙광장) 건물 선택 → 사이드 패널 오픈
    await input.press("Enter");
    await expect(page.getByLabel("중앙광장 접근성 정보")).toBeVisible();
  });

  test("Escape는 리스트만 닫고 검색어는 유지한다", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("건물 검색...");
    await input.fill("중앙도서관");
    await expect(page.getByRole("option")).toHaveCount(1);

    await input.press("Escape");
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(input).toHaveValue("중앙도서관");
  });

  test("결과가 없으면 안내 문구를 보여준다", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("zzzzz");

    await expect(page.getByText("검색 결과가 없어요")).toBeVisible();
  });

  test("지우기 버튼이 검색어를 비우고 리스트를 닫는다", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("건물 검색...");
    await input.fill("중앙");
    await expect(page.getByRole("option")).toHaveCount(1);

    await page.getByRole("button", { name: "검색어 지우기" }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("결과 목록 접근성 라벨이 UI 언어를 따른다", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("English").click();
    await page.getByPlaceholder("Search buildings...").fill("Library");

    // listbox의 접근 이름이 한국어 고정이 아니라 현재 언어(영어)로 노출
    await expect(
      page.getByRole("listbox", { name: "Search results" }),
    ).toBeVisible();
  });

  test("결과가 8개를 초과하면 개수 안내가 표시 개수가 아닌 총 개수를 알린다", async ({
    page,
  }) => {
    const poly = (dx: number) => ({
      type: "Polygon",
      coordinates: [
        [
          [127.032 + dx, 37.589],
          [127.0324 + dx, 37.589],
          [127.0324 + dx, 37.5894],
          [127.032 + dx, 37.5894],
          [127.032 + dx, 37.589],
        ],
      ],
    });
    // "중앙"이 들어간 건물 10개 반환 → 결과는 8개로 잘리지만 총량은 10
    await page.route("**/api/buildings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          type: "FeatureCollection",
          features: Array.from({ length: 10 }, (_, i) => ({
            type: "Feature",
            geometry: poly(i * 0.001),
            properties: {
              id: i + 1,
              name: `중앙건물 ${i + 1}`,
              name_en: `Central ${i + 1}`,
            },
          })),
        }),
      }),
    );

    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙");

    // 옵션은 8개로 제한되지만
    await expect(page.getByRole("option")).toHaveCount(8);
    // 초과 안내 문구와, 실제 총 개수(10)를 알리는 개수 라이브 영역
    await expect(
      page.getByText("검색 결과가 많아요. 검색어를 좁혀 보세요."),
    ).toBeVisible();
    await expect(page.locator(".ku-search-count")).toHaveText("10개 결과");
  });
});
