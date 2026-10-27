import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 5.2

const MOBILE = { width: 390, height: 844 };
const LIBRARY = "중앙도서관";
const ENGINEERING = "공학관";

/** 중앙도서관 폴리곤을 동쪽으로 옮긴 둘째 건물. 공용 픽스처는 건드리지 않는다 */
function addEngineeringHall(state: MockState) {
  const library = state.buildings[0];
  const geojson = structuredClone(library.geojson) as {
    geometry: { coordinates: number[][][] };
  };
  geojson.geometry.coordinates = geojson.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lng + 0.0012, lat]),
  );
  state.buildings.push({
    ...library,
    id: 2,
    name: ENGINEERING,
    name_en: "Engineering Hall",
    geojson,
  });
}

function label(page: Page, name: string) {
  return page.locator(".ku-building-label").filter({ hasText: name });
}

function building(page: Page, index: number) {
  return page
    .locator(".leaflet-overlay-pane path.leaflet-interactive")
    .nth(index);
}

async function zoomToLabels(page: Page) {
  await page
    .locator(".leaflet-container")
    .dblclick({ position: { x: 600, y: 400 } });
  await expect(page.locator(".ku-map-shell")).toHaveAttribute(
    "data-building-labels-visible",
    "true",
  );
}

async function expectEmphasized(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("opacity", "1");
  await expect(locator).toHaveCSS("font-weight", "800");
  await expect(locator).toHaveCSS("font-size", "12.5px");
}

async function expectPlain(locator: Locator) {
  await expect(locator).toHaveCSS("opacity", "0.58");
  await expect(locator).toHaveCSS("font-weight", "650");
}

async function centerOf(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const currentTileZoom = (page: Page) =>
  page.locator(".leaflet-tile").evaluateAll((tiles) =>
    Math.max(
      ...tiles.map((tile) => {
        const match = (tile as HTMLImageElement).src.match(
          /light_all\/(\d+)\//,
        );
        return match ? Number(match[1]) : 0;
      }),
    ),
  );

test.describe("건물 이름 강조 — 웹", () => {
  test.beforeEach(async ({ page }) => {
    const state = await installMockBackend(page);
    addEngineeringHall(state);
    // 공용 픽스처의 명소(다람쥐길) 이름표가 확대 17에서 도서관 폴리곤 가운데를 덮어 마우스가 폴리곤에 닿지 않는다
    state.landmarks.length = 0;
    await page.goto("/");
    await expect(page.locator(".ku-building-label")).toHaveCount(2);
  });

  test("이름이 보이는 확대에서 마우스를 올린 건물 이름만 강조하고 가운데는 그대로다", async ({
    page,
  }) => {
    await zoomToLabels(page);
    const library = label(page, LIBRARY);
    await expectPlain(library);
    const before = await centerOf(library);

    await building(page, 0).hover();
    await expectEmphasized(library);
    await expectPlain(label(page, ENGINEERING));
    const after = await centerOf(library);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);

    await page.mouse.move(640, 700);
    await expectPlain(library);
  });

  test("마우스를 올린 건물과 선택된 건물이 다르면 둘 다 강조하고, 선택을 풀면 선택만 빠진다", async ({
    page,
  }) => {
    await zoomToLabels(page);
    await building(page, 0).click();
    await expect(page.locator(".ku-side-panel")).toBeVisible();
    await building(page, 1).hover();
    await expectEmphasized(label(page, LIBRARY));
    await expectEmphasized(label(page, ENGINEERING));

    await page.mouse.move(640, 700);
    await expectPlain(label(page, ENGINEERING));
    await expectEmphasized(label(page, LIBRARY));

    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
    await expectPlain(label(page, LIBRARY));
  });

  test("이름이 숨는 확대에서는 선택한 건물 이름만 띄우고 그 건물에는 커서 이름표를 띄우지 않는다", async ({
    page,
  }) => {
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "false",
    );
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await building(page, 0).click();
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);
    await expectEmphasized(label(page, LIBRARY));
    await expect(label(page, ENGINEERING)).toBeHidden();

    await page.mouse.move(640, 700);
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);
    await building(page, 1).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await expect(label(page, ENGINEERING)).toBeHidden();

    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
    await expect(label(page, LIBRARY)).toBeHidden();
  });

  test("선택 강조는 언어를 바꾸거나 지도를 다시 그리거나 확대를 바꿔도 남는다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));

    await page.getByTitle("English").click();
    await expectEmphasized(label(page, "Central Library"));

    await page.getByRole("button", { name: "Switch to satellite" }).click();
    // 다시 만든 층의 이름표가 열린다. 옛 이름표는 Leaflet 페이드(200ms) 뒤에 빠지므로 그때까지 둘이 겹친다
    await expect(page.locator(".ku-building-label")).toHaveCount(2);
    await expectEmphasized(label(page, "Central Library"));

    await page.getByRole("button", { name: "확대" }).click();
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "true",
    );
    await expectEmphasized(label(page, "Central Library"));
    await expectPlain(label(page, "Engineering Hall"));
  });

  test("마우스를 올린 채 휠로 확대 경계를 넘어도 이름표 가운데가 그대로다", async ({
    page,
  }) => {
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await page.mouse.wheel(0, -120);
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "true",
    );
    const library = label(page, LIBRARY);
    await expectEmphasized(library);
    const hovered = await centerOf(library);

    // 강조를 떼면 자리를 다시 잰다. 경계를 넘을 때 가운데가 맞았다면 떼어도 그대로다
    await page.mouse.move(640, 700);
    await expectPlain(library);
    const plain = await centerOf(library);
    expect(Math.abs(hovered.x - plain.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(hovered.y - plain.y)).toBeLessThanOrEqual(1);
  });

  test("상세를 닫는 사이 다른 건물을 고르면 그 건물의 상세와 강조가 남는다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expect(
      page.getByRole("complementary", { name: `${LIBRARY} 접근성 정보` }),
    ).toBeVisible();
    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await building(page, 1).click();

    // 닫기 타이머(280ms)가 지난 뒤에도 남는지 봐야 해 시간을 둔다
    await page.waitForTimeout(400);
    await expect(
      page.getByRole("complementary", { name: `${ENGINEERING} 접근성 정보` }),
    ).toBeVisible();
    await expectEmphasized(label(page, ENGINEERING));
    await expect(label(page, LIBRARY)).toBeHidden();
  });

  test("지하철역을 고르면 앞서 고른 건물의 강조가 풀리고, 그 건물을 다시 누르면 다시 고른다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));
    await expect(building(page, 0)).toHaveAttribute("fill-opacity", "0.38");

    await page.getByTitle("고려대역", { exact: true }).click();
    await expect(label(page, LIBRARY)).toBeHidden();
    await expect(building(page, 0)).toHaveAttribute("fill-opacity", "0.18");

    await building(page, 0).click();
    await expect(
      page.getByRole("complementary", { name: `${LIBRARY} 접근성 정보` }),
    ).toBeVisible();
    await expectEmphasized(label(page, LIBRARY));
  });
});

test.describe("건물 이름 강조 — 모바일", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await installMockBackend(page);
    await page.goto("/");
    await expect(page.locator(".ku-building-label")).toHaveCount(1);
  });

  test("누른 건물 이름이 상세 시트에 가리면 확대는 두고 시트 위로 옮긴다", async ({
    page,
  }) => {
    const zoomBefore = await currentTileZoom(page);
    const sheetTop = MOBILE.height - Math.min(MOBILE.height * 0.62, 620);
    const before = await building(page, 0).boundingBox();
    expect(before!.y).toBeGreaterThan(sheetTop);

    await building(page, 0).click();
    await expect(page.locator(".ku-side-panel")).toBeVisible();
    const library = label(page, LIBRARY);
    await expectEmphasized(library);
    // 위아래 모두 지도 위 ~ 시트 위 안이어야 한다 — 아래만 보면 화면 위로 밀려 나가도 통과한다
    await expect
      .poll(async () => {
        const box = await library.boundingBox();
        return Boolean(box && box.y >= 0 && box.y + box.height <= sheetTop);
      })
      .toBe(true);
    expect(await currentTileZoom(page)).toBe(zoomBefore);
  });

  test("누른 건물 이름이 이미 시트 위에 보이면 지도를 옮기지 않는다", async ({
    page,
  }) => {
    // 건물을 화면 위쪽으로 끌어 올린다
    const start = (await building(page, 0).boundingBox())!;
    await page.mouse.move(
      start.x + start.width / 2,
      start.y + start.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, 170, { steps: 10 });
    // 멈췄다 놓는다. Leaflet은 놓기 직전 50ms의 움직임으로 관성을 주는데, 바로 놓으면 지도가 화면 밖까지 미끄러진다
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const settled = (await building(page, 0).boundingBox())!;
    const sheetTop = MOBILE.height - Math.min(MOBILE.height * 0.62, 620);
    expect(settled.y + settled.height).toBeLessThan(sheetTop - 24);

    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));
    await page.waitForTimeout(400);
    const after = (await building(page, 0).boundingBox())!;
    expect(Math.abs(after.y - settled.y)).toBeLessThanOrEqual(1);
  });
});
