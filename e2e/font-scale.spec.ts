import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-28-font-scale-design.md 5.2, docs/specs/2026-10-29-map-buttons-feedback-design.md 4장

const MAX = 1.5;

type Target = [string, Locator];
type Box = { x: number; y: number; width: number; height: number };

function trigger(page: Page, name = "글자 크기") {
  return page
    .locator(".ku-map-actions")
    .getByRole("button", { name, exact: true });
}

function slider(page: Page, name = "글자 크기") {
  return page.getByRole("slider", { name, exact: true });
}

function popover(page: Page) {
  return page.locator(".ku-font-scale-popover");
}

/** 칸을 열고 키보드로 percent에 맞춘 뒤 Esc로 닫는다. fill()은 React가 값 바꿈을 놓칠 수 있어 쓰지 않는다 */
async function setScale(page: Page, percent: number) {
  await trigger(page).click();
  await expect(slider(page)).toBeFocused();
  await page.keyboard.press("Home");
  for (let step = 90; step < percent; step += 10)
    await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toHaveValue(String(percent));
  await page.keyboard.press("Escape");
  await expect(popover(page)).toHaveCount(0);
}

function menuNav(page: Page) {
  return page.getByRole("navigation", { name: "지도 메뉴" });
}

function htmlScale(page: Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-font-scale"),
  );
}

function storedScale(page: Page) {
  return page.evaluate(() => localStorage.getItem("ku_font_scale"));
}

function fontPx(locator: Locator) {
  return locator.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
}

function overlaps(a: Box, b: Box) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

async function seedFavorite(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ku_favorites",
      JSON.stringify([
        { id: 1, name: "중앙도서관", name_en: "Central Library" },
      ]),
    ),
  );
}

async function measure(targets: Target[]) {
  const sizes: number[] = [];
  for (const [, locator] of targets) sizes.push(await fontPx(locator));
  return sizes;
}

async function expectSizes(targets: Target[], expected: number[]) {
  for (const [index, [name, locator]] of targets.entries())
    await expect
      .poll(() => fontPx(locator), { message: name })
      .toBeCloseTo(expected[index], 1);
}

/** 100에서 잰 뒤 150으로 바꿔 1.5배인지 보고 100으로 되돌린다. 칸을 열려고 버튼을 누르면 닫히는 것은 restore로 다시 연다 */
async function expectScaled(
  page: Page,
  targets: Target[],
  restore?: () => Promise<void>,
) {
  const normal = await measure(targets);
  await setScale(page, 150);
  await restore?.();
  await expectSizes(
    targets,
    normal.map((size) => size * MAX),
  );
  await setScale(page, 100);
  await expect.poll(() => htmlScale(page)).toBeNull();
}

/** 모달 바탕이 버튼 열을 덮는다(설계 4장) — 닫고 바꾼 뒤 다시 연다 */
async function expectScaledAcrossReopen(
  page: Page,
  open: () => Promise<void>,
  targets: () => Target[],
) {
  await open();
  const normal = await measure(targets());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await setScale(page, 150);
  await open();
  await expectSizes(
    targets(),
    normal.map((size) => size * MAX),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await setScale(page, 100);
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

async function openFacilityPopup(page: Page) {
  await menuNav(page)
    .getByRole("button", { name: "필터", exact: true })
    .click();
  await page.getByRole("button", { name: "시설", exact: true }).click();
  await page.getByRole("button", { name: /경사로/ }).click();
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="facility-marker-f-installed"]').click();
  await expect(page.locator(".leaflet-popup")).toBeVisible();
}

async function closePopup(page: Page) {
  await page.locator(".leaflet-popup-close-button").click();
  // 닫힌 팝업은 페이드 동안 남는다 — 다음 팝업과 겹쳐 잡히지 않게 기다린다
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
}

async function openLibraryDetail(page: Page) {
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();
  await expect(page.locator(".ku-side-panel")).toBeVisible();
}

/** check()·uncheck()처럼 누르기 전과 뒤의 상태를 함께 본다 */
async function setSlope(page: Page, on: boolean, name = "경사도") {
  const button = page
    .locator(".ku-map-actions")
    .getByRole("button", { name, exact: true });
  await expect(button).toHaveAttribute("aria-pressed", String(!on));
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(on));
}

function visibleActionNames(page: Page) {
  return page
    .locator(".ku-map-actions button")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getAttribute("aria-label")),
    );
}

test.describe("글자 크기 — 버튼", () => {
  test("처음에는 100이고 이름 붙은 버튼 하나에 칸은 닫혀 있다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await expect(trigger(page)).toBeVisible();
    expect(await htmlScale(page)).toBeNull();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(trigger(page)).not.toHaveAttribute("aria-controls");
    await expect(trigger(page)).toHaveAttribute("title", "글자 크기 100%");
    await expect(trigger(page)).toHaveAccessibleDescription("글자 크기 100%");
    await expect(trigger(page).locator(".ku-font-scale-glyph")).toHaveText(
      "가",
    );
    await expect(trigger(page).locator(".ku-map-action-label")).toHaveText(
      "글자 크기",
    );
    await expect(popover(page)).toHaveCount(0);
  });

  const MOBILE_NAMES = [
    "글자 크기",
    "현 위치",
    "위성 지도로 전환",
    "경사도",
    "피드백 보내기",
  ];
  const PLACES = [
    {
      name: "접힌 줄",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: false,
      names: ["위성 지도로 전환", "경사도", "글자 크기", "피드백 보내기"],
      whole: false,
      slope: false,
      landscape: false,
    },
    {
      name: "펼침",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: true,
      names: [
        "위성 지도로 전환",
        "경사도",
        "다크모드",
        "글자 크기",
        "피드백 보내기",
      ],
      whole: false,
      slope: true,
      landscape: false,
    },
    {
      name: "모바일",
      viewport: { width: 390, height: 844 },
      expandMapMenu: true,
      names: MOBILE_NAMES,
      whole: true,
      slope: false,
      landscape: false,
    },
    {
      name: "가로 좁은 화면",
      viewport: { width: 740, height: 360 },
      expandMapMenu: true,
      names: MOBILE_NAMES,
      whole: true,
      slope: true,
      landscape: true,
    },
  ];
  for (const place of PLACES) {
    test(`${place.name}: 자리, 키보드로 열고 움직이고 Esc로 닫는다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await page.goto("/");
      await expect(trigger(page)).toBeVisible();
      const names = await visibleActionNames(page);
      expect(place.whole ? names : names.slice(-place.names.length)).toEqual(
        place.names,
      );
      if (place.slope) await setSlope(page, true);

      const panel = page.locator(".ku-menu-panel");
      if (!place.expandMapMenu) {
        await menuNav(page)
          .getByRole("button", { name: "필터", exact: true })
          .click();
        await expect(panel).toBeVisible();
      }

      await trigger(page).focus();
      await page.keyboard.press("Enter");
      await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
      const popoverId = await popover(page).getAttribute("id");
      expect(popoverId).toBeTruthy();
      await expect(trigger(page)).toHaveAttribute("aria-controls", popoverId!);
      await expect(slider(page)).toBeFocused();
      await expect(slider(page)).toHaveValue("100");
      await expect(slider(page)).toHaveAttribute("aria-valuetext", "100%");

      // 칸은 화면 안이고 지도 버튼·범례를 덮지 않는다(설계 4.3)
      const box = (await popover(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(place.viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(place.viewport.height);
      const buttons = page.locator(".ku-map-actions button");
      for (let index = 0; index < (await buttons.count()); index += 1) {
        const button = await buttons.nth(index).boundingBox();
        if (button) expect(overlaps(box, button), `버튼 ${index}`).toBe(false);
      }
      if (place.slope) {
        const legend = (await page.locator(".ku-slope-legend").boundingBox())!;
        expect(overlaps(box, legend), "범례").toBe(false);
      }
      if (place.landscape) {
        // 범례까지 담은 묶음 위에 연다
        const corner = (await page.locator(".ku-map-corner").boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(corner.y);
      } else {
        const button = (await trigger(page).boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(button.x);
      }

      await page.keyboard.press("ArrowRight");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "110",
      );
      expect(await storedScale(page)).toBe("110");
      await expect(slider(page)).toHaveAttribute("aria-valuetext", "110%");
      await expect(popover(page).locator(".ku-font-scale-value")).toHaveText(
        "110%",
      );
      await page.keyboard.press("End");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "150",
      );
      await page.keyboard.press("Home");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "90",
      );
      await page.keyboard.press("ArrowLeft");
      await expect(slider(page)).toHaveValue("90");
      expect(await storedScale(page)).toBe("90");

      await page.keyboard.press("Escape");
      await expect(popover(page)).toHaveCount(0);
      await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
      await expect(trigger(page)).not.toHaveAttribute("aria-controls");
      await expect(trigger(page)).toBeFocused();
      await expect(trigger(page)).toHaveAccessibleDescription("글자 크기 90%");
      if (!place.expandMapMenu) await expect(panel).toBeVisible();
    });
  }

  test("버튼을 다시 누르거나 지도를 누르거나 Tab으로 나가면 닫히고, 칸 안 글자를 눌러도 남는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await trigger(page).click();
    await expect(popover(page)).toBeVisible();
    await popover(page).locator(".ku-font-scale-value").click();
    await popover(page).locator(".ku-font-scale-end").first().click();
    await expect(popover(page)).toBeVisible();
    await trigger(page).click();
    await expect(popover(page)).toHaveCount(0);
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");

    await trigger(page).click();
    await expect(popover(page)).toBeVisible();
    await page
      .locator(".leaflet-container")
      .click({ position: { x: 640, y: 300 } });
    await expect(popover(page)).toHaveCount(0);

    await trigger(page).click();
    await expect(slider(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(popover(page)).toHaveCount(0);
  });

  test("마우스로 슬라이더 오른쪽 끝을 누르면 150이다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await trigger(page).click();
    const box = (await slider(page).boundingBox())!;
    await slider(page).click({
      position: { x: box.width - 2, y: box.height / 2 },
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "150",
    );
    expect(await storedScale(page)).toBe("150");
  });

  test.describe("터치", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("탭으로 열고 슬라이더 끝을 탭하면 150이고 지도를 탭하면 닫힌다", async ({
      page,
    }) => {
      await installMockBackend(page);
      await page.goto("/");
      await trigger(page).tap();
      await expect(popover(page)).toBeVisible();
      const box = (await slider(page).boundingBox())!;
      await slider(page).tap({
        position: { x: box.width - 2, y: box.height / 2 },
      });
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "150",
      );
      await page
        .locator(".leaflet-container")
        .tap({ position: { x: 100, y: 200 } });
      await expect(popover(page)).toHaveCount(0);
    });
  });

  test("모바일: 칸을 연 채 아래 줄 검색을 누르면 칸이 닫히고 패널을 닫아도 닫혀 있다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await trigger(page).click();
    await expect(popover(page)).toBeVisible();
    await menuNav(page)
      .getByRole("button", { name: "검색", exact: true })
      .click();
    await expect(popover(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(popover(page)).toHaveCount(0);
  });

  const LEGACY = [
    { stored: "small", attribute: "90", value: "90" },
    { stored: "large", attribute: "120", value: "120" },
    { stored: "normal", attribute: null, value: "100" },
  ] as const;
  for (const { stored, attribute, value } of LEGACY) {
    test(`세 단계였을 때의 ${stored}는 ${value}%로 이어진다`, async ({
      page,
    }) => {
      await installMockBackend(page, { fontScale: stored });
      await page.goto("/");
      await expect(trigger(page)).toBeVisible();
      expect(await htmlScale(page)).toBe(attribute);
      await trigger(page).click();
      await expect(slider(page)).toHaveValue(value);
      // 고쳐 쓰지 않는다 — 움직이기 전까지 옛 값이 남는다(설계 4.2)
      expect(await storedScale(page)).toBe(stored);
    });
  }

  const LANG_NAMES = {
    en: { name: "Text size", glyph: "A" },
    zh: { name: "字号", glyph: "字" },
  } as const;
  for (const [lang, { name, glyph }] of Object.entries(LANG_NAMES)) {
    test(`${lang}: 버튼 글자·이름과 슬라이더 이름`, async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("ku_map_lang", value),
        lang,
      );
      await installMockBackend(page);
      await page.goto("/");
      await expect(
        trigger(page, name).locator(".ku-font-scale-glyph"),
      ).toHaveText(glyph);
      await expect(
        trigger(page, name).locator(".ku-map-action-label"),
      ).toHaveText(name);
      await trigger(page, name).click();
      await expect(slider(page, name)).toBeFocused();
    });
  }

  for (const { stored, attribute } of [
    { stored: "130", attribute: "130" },
    { stored: "large", attribute: "120" },
  ] as const) {
    test(`저장된 ${stored}는 앱 JS 없이도 첫 그리기 전에 ${attribute}로 걸리고 다크도 함께 걸린다`, async ({
      page,
    }) => {
      await installMockBackend(page, { fontScale: stored, theme: "dark" });
      await page.route("**/_next/static/**/*.js", (route) => route.abort());
      await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(await htmlScale(page)).toBe(attribute);
      expect(
        await page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        ),
      ).toBe("dark");
    });
  }

  test("저장소가 예외를 던져도 100으로 열리고 슬라이더는 화면을 바꾼다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === "ku_font_scale") throw new Error("blocked");
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "ku_font_scale") throw new Error("blocked");
        return setItem.call(this, key, value);
      };
    });
    await installMockBackend(page);
    await page.goto("/");
    await expect(trigger(page)).toBeVisible();
    expect(await htmlScale(page)).toBeNull();

    await trigger(page).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "110",
    );
    expect(errors).toEqual([]);
  });
});

test.describe("글자 크기 — 커지는 글자와 그대로인 글자", () => {
  test("검색·필터·즐겨찾기·목록 패널", async ({ page }) => {
    await seedFavorite(page);
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    const nav = menuNav(page);
    const panel = page.locator(".ku-menu-panel");

    await nav.getByRole("button", { name: "검색", exact: true }).click();
    const input = page.getByPlaceholder("건물 검색...");
    const option = page.getByRole("option").first();
    await input.fill("중앙");
    await expect(option).toBeVisible();
    // 결과 목록은 검색창이 초점을 잃으면 닫힌다(SearchControl의 onBlur) — 버튼을 누른 뒤 다시 초점을 준다
    await expectScaled(
      page,
      [
        ["검색창", input],
        ["검색 결과", option],
      ],
      async () => {
        await input.focus();
        await expect(option).toBeVisible();
      },
    );
    await nav.getByRole("button", { name: "필터", exact: true }).click();
    await panel.getByRole("button", { name: "시설", exact: true }).click();
    await expect(panel.locator(".ku-chip").first()).toBeVisible();
    await expectScaled(page, [
      ["필터 제목", panel.locator(".ku-filter-heading").first()],
      ["필터 칩", panel.locator(".ku-chip").first()],
    ]);
    await nav.getByRole("button", { name: /^즐겨찾기/ }).click();
    await expectScaled(page, [
      ["즐겨찾기", panel.locator(".ku-favorite-row").first()],
    ]);
    await nav.getByRole("button", { name: /^목록/ }).click();
    await expectScaled(page, [
      ["목록", panel.locator(".ku-map-browse-copy strong").first()],
    ]);
  });

  test("건물 상세와 등록 요청·피드백 모달", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await openLibraryDetail(page);
    await page.waitForLoadState("networkidle");
    await expectScaled(page, [["건물 이름", page.locator(".ku-side-title")]]);

    const request = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expectScaledAcrossReopen(
      page,
      async () => {
        await page.getByRole("button", { name: "시설 등록 요청" }).click();
        await expect(request).toBeVisible();
        await expect(request.locator(".bldg-label").first()).toBeAttached();
      },
      () => [
        ["모달 제목", request.locator(".ku-request-modal-title")],
        ["입력 이름", request.locator("label").first()],
        [
          "아래 버튼",
          request.locator(".ku-request-modal-actions button").first(),
        ],
        ["지도 건물 이름", request.locator(".bldg-label").first()],
      ],
    );

    const feedback = page.getByRole("dialog", { name: "피드백 보내기" });
    await expectScaledAcrossReopen(
      page,
      async () => {
        await page.getByTitle("피드백 보내기").click();
        await expect(feedback).toBeVisible();
      },
      () => [["모달 제목", feedback.locator(".ku-feedback-title")]],
    );
  });

  test("시설·명소·경사도 팝업", async ({ page }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    await menuNav(page)
      .getByRole("button", { name: "필터", exact: true })
      .click();
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await page.keyboard.press("Escape");
    await setSlope(page, true);
    const content = page.locator(".leaflet-popup-content");

    await page.locator('[data-testid="facility-marker-f-installed"]').click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expectScaled(page, [
      ["시설 팝업", content.locator(":scope > div").first()],
    ]);
    await closePopup(page);

    await page.locator('[data-testid^="landmark-marker-"]').first().click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expectScaled(page, [
      ["명소 팝업", content.locator(":scope > div > div").first()],
    ]);
    await closePopup(page);

    await page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]').click();
    await expect(page.locator(".leaflet-popup")).toContainText("정문-중앙광장");
    await expectScaled(page, [
      ["경사도 팝업", content.locator(":scope > div").first()],
    ]);
  });

  test("경사도 범례 툴팁", async ({ page }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    await setSlope(page, true);
    const cell = page
      .getByRole("group", { name: "경사도 범례" })
      .getByRole("button")
      .first();
    const tooltip = page.locator(".ku-slope-bands-tooltip");
    await cell.click();
    await expect(tooltip).toBeVisible();
    // 툴팁은 바깥을 누르면 닫힌다(SlopeBandsLegend의 pointerdown) — 버튼을 누른 뒤 칸을 다시 눌러 연다
    await expectScaled(page, [["범례 툴팁", tooltip]], async () => {
      await cell.click();
      await expect(tooltip).toBeVisible();
    });
  });

  test("지도 위 건물·명소·지하철역 이름", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await zoomToLabels(page);
    await expectScaled(page, [
      ["건물 이름", page.locator(".ku-building-label").first()],
      ["명소 이름", page.locator('[data-testid="landmark-label"]').first()],
      ["지하철역 이름", page.locator('[data-testid="subway-label"]').first()],
    ]);
  });

  test("저장 값 90이면 0.9배다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await openLibraryDetail(page);
    const title = page.locator(".ku-side-title");
    const normal = await fontPx(title);
    await setScale(page, 90);
    await expect.poll(() => fontPx(title)).toBeCloseTo(normal * 0.9, 1);
  });

  test("크기를 주지 않은 글자도 따라온다", async ({ page }) => {
    await installMockBackend(page);
    await page.route("**/rest/v1/building_facilities**", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: "{}",
          })
        : route.fallback(),
    );
    await page.goto("/");
    await openLibraryDetail(page);
    await expectScaled(page, [
      ["불러오기 실패", page.getByText("접근성 정보를 불러오지 못했어요")],
    ]);
  });

  test("메뉴 줄·지도 버튼·언어·출처·범례 눈금·버튼 글자는 그대로다", async ({
    page,
  }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    await setSlope(page, true);
    await expect(
      page.locator(".ku-slope-bands-ticks span").first(),
    ).toBeVisible();
    const targets: Target[] = [
      [
        "메뉴 줄 이름",
        page.locator(".ku-menu-nav--rail .ku-menu-label").first(),
      ],
      ["지도 버튼 이름", page.locator(".ku-map-action-label").first()],
      ["언어 버튼", page.locator(".ku-language-inline button").first()],
      ["출처 표기", page.locator(".ku-attribution")],
      ["범례 눈금", page.locator(".ku-slope-bands-ticks span").first()],
      ["글자 크기 버튼 글자", trigger(page).locator(".ku-font-scale-glyph")],
      ["글자 크기 버튼 이름", trigger(page).locator(".ku-map-action-label")],
    ];
    const popoverTargets: Target[] = [
      ["칸 작은 글자", popover(page).locator(".ku-font-scale-end").first()],
      ["칸 큰 글자", popover(page).locator(".ku-font-scale-end").last()],
      ["칸 값", popover(page).locator(".ku-font-scale-value")],
    ];
    const normal = await measure(targets);
    await trigger(page).click();
    const normalPopover = await measure(popoverTargets);
    await page.keyboard.press("End");
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "150",
    );
    await expectSizes(popoverTargets, normalPopover);
    await page.keyboard.press("Escape");
    await expectSizes(targets, normal);
  });

  test("관리자 화면 글자는 저장 값이 150이어도, 옛 크게여도 그대로다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    const sample = async () => {
      await page.goto("/admin/dashboard/buildings");
      await expect(page.locator(".ku-admin-header")).toBeVisible();
      const header = await fontPx(page.locator(".ku-admin-header"));
      await page.goto("/admin/buildings/1");
      await page.getByRole("button", { name: "+ 시설 추가" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".bldg-label").first()).toBeAttached();
      return [
        header,
        await fontPx(dialog.locator("label").first()),
        await fontPx(dialog.locator("input").first()),
        await fontPx(dialog.locator(".bldg-label").first()),
      ];
    };
    const normal = await sample();
    for (const [stored, attribute] of [
      ["150", "150"],
      ["large", "120"],
    ]) {
      await page.evaluate(
        (value) => localStorage.setItem("ku_font_scale", value),
        stored,
      );
      const scaled = await sample();
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        attribute,
      );
      expect(scaled, stored).toEqual(normal);
    }
  });
});

test.describe("글자 크기 — 다시 재는 자리", () => {
  async function expectEmphasized(locator: Locator, size: string) {
    await expect(locator).toHaveCSS("opacity", "1");
    await expect(locator).toHaveCSS("font-weight", "800");
    await expect(locator).toHaveCSS("font-size", size);
  }

  async function expectPlain(locator: Locator) {
    await expect(locator).toHaveCSS("opacity", "0.58");
    await expect(locator).toHaveCSS("font-weight", "650");
  }

  async function centerOf(locator: Locator) {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test.describe("건물 이름 강조(멘토링 설계 5.2)", () => {
    test.beforeEach(async ({ page }) => {
      const state = await installMockBackend(page);
      // 명소 이름표가 확대 17에서 도서관 폴리곤 가운데를 덮는다(building-label-emphasis.spec.ts와 같다)
      state.landmarks.length = 0;
      await page.goto("/");
      await zoomToLabels(page);
    });

    test("마우스를 올린 이름은 배율을 바꿔도 강조와 가운데가 그대로다", async ({
      page,
    }) => {
      const label = page
        .locator(".ku-building-label")
        .filter({ hasText: "중앙도서관" });
      await page
        .locator(".leaflet-overlay-pane path.leaflet-interactive")
        .first()
        .hover();
      await expectEmphasized(label, "11px");
      const before = await centerOf(label);
      // 마우스를 건물 위에 둔 채 키보드로 연다
      await trigger(page).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("End");
      await page.keyboard.press("Escape");
      await expectEmphasized(label, "16.5px");
      const after = await centerOf(label);
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

      await page.mouse.move(640, 700);
      await expectPlain(label);
    });

    test("선택된 이름은 배율을 바꿔도 강조와 가운데가 그대로고 상세를 닫으면 돌아온다", async ({
      page,
    }) => {
      const label = page
        .locator(".ku-building-label")
        .filter({ hasText: "중앙도서관" });
      await page
        .locator(".leaflet-overlay-pane path.leaflet-interactive")
        .first()
        .click();
      await expect(page.locator(".ku-side-panel")).toBeVisible();
      await expectEmphasized(label, "11px");
      const before = await centerOf(label);
      await setScale(page, 150);
      await expectEmphasized(label, "16.5px");
      const after = await centerOf(label);
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

      await page
        .locator(".ku-side-panel")
        .getByRole("button", { name: "닫기" })
        .click();
      await expect(page.locator(".ku-side-panel")).toHaveCount(0);
      await expectPlain(label);
    });
  });

  test("열린 팝업은 배율을 바꾸면 새로 연 것과 같은 폭으로 다시 잡힌다", async ({
    page,
  }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    await openFacilityPopup(page);
    const content = page.locator(".leaflet-popup-content");
    const width = () =>
      content.evaluate((element) => element.getBoundingClientRect().width);

    await setScale(page, 150);
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expect
      .poll(() => fontPx(content.locator(":scope > div").first()))
      .toBeCloseTo(13 * MAX, 1);
    const updated = await width();
    const close = (await page
      .locator(".leaflet-popup-close-button")
      .boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(close.x).toBeGreaterThanOrEqual(0);
    expect(close.y).toBeGreaterThanOrEqual(0);
    expect(close.x + close.width).toBeLessThanOrEqual(viewport.width);

    await closePopup(page);
    await page.locator('[data-testid="facility-marker-f-installed"]').click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    expect(Math.abs((await width()) - updated)).toBeLessThanOrEqual(1);
  });
});

test.describe("글자 크기 — 150%에서 넘치지 않는다", () => {
  /** 대상 안에서 잘린 글. 스크롤 상자, 일부러 자르는 글(줄 수 제한·말줄임), 숨김 글, 피드백 함정 칸, 모달 위치 지도는 뺀다 */
  function clippedText(region: Locator) {
    return region.evaluate((root) => {
      const skip =
        ".ku-visually-hidden, .ku-feedback-honeypot, .leaflet-container";
      const scrolls = (value: string) => value === "auto" || value === "scroll";
      return [root, ...Array.from(root.querySelectorAll("*"))]
        .filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement &&
            !element.closest(skip) &&
            element.getClientRects().length > 0,
        )
        .filter((element) => {
          const style = getComputedStyle(element);
          if (scrolls(style.overflowX) || scrolls(style.overflowY))
            return false;
          if (
            style.webkitLineClamp !== "none" ||
            style.textOverflow === "ellipsis"
          )
            return false;
          return (
            (style.overflowY !== "visible" &&
              element.scrollHeight > element.clientHeight + 1) ||
            element.scrollWidth > element.clientWidth + 1
          );
        })
        .map(
          (element) =>
            `${element.className || element.tagName}: ${(element.textContent ?? "").trim().slice(0, 30)}`,
        );
    });
  }

  async function expectNoOverflow(label: string, locator: Locator) {
    const [scrollWidth, clientWidth] = await locator.evaluate((element) => [
      element.scrollWidth,
      element.clientWidth,
    ]);
    expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
    const [pageWidth, viewportWidth] = await locator
      .page()
      .evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
    expect(pageWidth, `${label} 문서`).toBeLessThanOrEqual(viewportWidth);
    expect(await clippedText(locator), `${label} 잘린 글`).toEqual([]);
  }

  const LANGS = [
    {
      lang: "ko",
      menu: "지도 메뉴",
      panels: [/^검색/, /^필터/, /^즐겨찾기/, /^목록/],
      sections: ["캠퍼스 영역", "시설"],
      slope: "경사도",
      fontScale: "글자 크기",
      placeholder: "건물 검색...",
      library: "중앙도서관",
      request: "시설 등록 요청",
    },
    {
      lang: "en",
      menu: "Map menu",
      panels: [/^Search/, /^Filters/, /^Favorites/, /^List/],
      sections: ["Campus Areas", "Facilities"],
      slope: "Slope",
      fontScale: "Text size",
      placeholder: "Search buildings...",
      library: "Central Library",
      request: "Suggest a facility",
    },
  ];
  const VIEWPORTS = [
    { width: 360, height: 780 },
    { width: 740, height: 360 },
  ];

  for (const names of LANGS)
    for (const viewport of VIEWPORTS) {
      const where = `${names.lang} ${viewport.width}×${viewport.height}`;

      test(`${where}: 메뉴 줄 이름은 그대로고 패널·칩·범례·칸이 넘치지 않으며 서로 덮지 않는다`, async ({
        page,
      }) => {
        await seedFavorite(page);
        await page.addInitScript(
          (value) => localStorage.setItem("ku_map_lang", value),
          names.lang,
        );
        await installMockBackend(page, { fontScale: "150" });
        await page.setViewportSize(viewport);
        await page.goto("/");
        const nav = page.getByRole("navigation", { name: names.menu });
        await expect(nav).toBeVisible();
        expect(await fontPx(nav.getByRole("button").first())).toBe(12);
        const panel = page.locator(".ku-menu-panel");
        for (const [index, name] of names.panels.entries()) {
          await nav.getByRole("button", { name }).click();
          await expect(panel).toBeVisible();
          if (index === 1) {
            for (const section of names.sections)
              await panel
                .getByRole("button", { name: section, exact: true })
                .click();
            await expect(panel.locator(".ku-chip").first()).toBeVisible();
            const clipped = await panel
              .locator(".ku-chip")
              .evaluateAll((chips) =>
                chips
                  .filter(
                    (chip) =>
                      chip.scrollWidth > chip.clientWidth + 1 ||
                      chip.scrollHeight > chip.clientHeight + 1,
                  )
                  .map((chip) => chip.textContent),
              );
            expect(clipped).toEqual([]);
          }
          await expectNoOverflow(String(name), panel);
          await nav.getByRole("button", { name }).click();
          await expect(panel).toHaveCount(0);
        }

        await setSlope(page, true, names.slope);
        const legend = page.locator(".ku-slope-legend");
        await expect(legend).toBeVisible();
        await expectNoOverflow("범례", legend);
        await trigger(page, names.fontScale).click();
        await expectNoOverflow("칸", popover(page));
        const box = (await popover(page).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        const legendBox = (await legend.boundingBox())!;
        expect(overlaps(box, legendBox), "칸과 범례").toBe(false);
        const buttons = page.locator(".ku-map-actions button");
        for (let index = 0; index < (await buttons.count()); index += 1) {
          const button = await buttons.nth(index).boundingBox();
          if (!button) continue;
          expect(overlaps(box, button), `칸과 버튼 ${index}`).toBe(false);
          expect(overlaps(legendBox, button), `범례와 버튼 ${index}`).toBe(
            false,
          );
        }
      });

      test(`${where}: 상세와 등록 요청·피드백 모달이 넘치지 않는다`, async ({
        page,
      }) => {
        await page.addInitScript(
          (value) => localStorage.setItem("ku_map_lang", value),
          names.lang,
        );
        await installMockBackend(page, { fontScale: "150" });
        await page.setViewportSize(viewport);
        await page.goto("/");
        await page
          .getByRole("navigation", { name: names.menu })
          .getByRole("button", { name: names.panels[0] })
          .click();
        await page.getByPlaceholder(names.placeholder).fill(names.library);
        await page.getByText(names.library, { exact: true }).last().click();
        const side = page.locator(".ku-side-panel");
        await expect(side).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expectNoOverflow("건물 상세", side);

        await page.getByRole("button", { name: names.request }).click();
        const request = page.getByRole("dialog", { name: names.request });
        await expect(request).toBeVisible();
        await expectNoOverflow("등록 요청", request);
        await page.keyboard.press("Escape");
        await expect(request).toHaveCount(0);
        await page.locator(".ku-side-close").click();
        await expect(side).toHaveCount(0);

        await page.getByTitle("피드백 보내기").click();
        const feedback = page.getByRole("dialog", { name: "피드백 보내기" });
        await expect(feedback).toBeVisible();
        await expectNoOverflow("피드백", feedback);
      });
    }
});

test("90%에서도 모바일 검색창은 16px다", async ({ page }) => {
  await installMockBackend(page, { fontScale: "90" });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await menuNav(page).getByRole("button", { name: /^검색/ }).click();
  expect(await fontPx(page.getByPlaceholder("건물 검색..."))).toBe(16);
});

test("가로 모드 667×375에서 버튼 줄이 언어 버튼과 겹치지 않는다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/");
  await expect(trigger(page)).toBeVisible();
  const row = (await page.locator(".ku-map-actions").boundingBox())!;
  const language = (await page.locator(".ku-language-trigger").boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(0);
  expect(overlaps(row, language)).toBe(false);
});

test("150%에서도 범례 눈금끼리 겹치지 않는다", async ({ page }) => {
  const state = await installMockBackend(page, { fontScale: "150" });
  state.slopeBands = {
    bands: [16.67, 33.33, 41.67, 58.33, 83.33, null].map(
      (upperPercent, index) => ({
        name: `구간 ${index + 1}`,
        upperPercent,
        color: "#8BC34A",
        description: "",
      }),
    ),
  };
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 375, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await setSlope(page, true);
    const legend = page.getByRole("group", { name: "경사도 범례" });
    await expect(legend.getByRole("button")).toHaveCount(6);
    const rows = await legend
      .locator(".ku-slope-bands-ticks")
      .evaluateAll((elements) =>
        elements.map((row) =>
          Array.from(row.children).map((tick) => {
            const box = tick.getBoundingClientRect();
            return [box.left, box.right];
          }),
        ),
      );
    expect(rows).toHaveLength(2);
    for (const ticks of rows) {
      expect(ticks).toHaveLength(5);
      for (let i = 1; i < ticks.length; i++)
        expect(ticks[i - 1][1]).toBeLessThanOrEqual(ticks[i][0]);
    }
  }
});

test.describe("글자 크기 — 지도 버튼 열 빈 자리", () => {
  /** 데이터를 불러오는 동안 로딩 막(.ku-map-loading)이 지도를 덮는다. 막은 지도와 함께 붙으므로 지도가 붙은 뒤에 걷히기를 기다린다 */
  async function openMap(page: Page) {
    await page.goto("/");
    await expect(trigger(page)).toBeVisible();
    await expect(page.locator(".ku-map-loading")).toHaveCount(0);
  }

  /** 틀 상자 안에서 내용(버튼·범례)이 없는 자리를 8px 간격으로 짚어, 지도나 출처 표기가 잡히는지 본다(설계 1.2) */
  function emptySpotMisses(page: Page, frame: string, content: string) {
    return page.evaluate(
      ({ frame, content }) => {
        const box = document.querySelector(frame)!.getBoundingClientRect();
        const filled = Array.from(document.querySelectorAll(content))
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        const misses: string[] = [];
        let checked = 0;
        for (let y = box.top + 2; y < box.bottom - 1; y += 8)
          for (let x = box.left + 2; x < box.right - 1; x += 8) {
            if (
              filled.some(
                (rect) =>
                  x >= rect.left - 1 &&
                  x <= rect.right + 1 &&
                  y >= rect.top - 1 &&
                  y <= rect.bottom + 1,
              )
            )
              continue;
            checked++;
            const hit = document.elementFromPoint(x, y);
            if (!hit?.closest(".leaflet-container, .ku-attribution"))
              misses.push(
                `${Math.round(x)},${Math.round(y)} ${hit?.getAttribute("class")}`,
              );
          }
        return { checked, misses };
      },
      { frame, content },
    );
  }

  const PLACES = [
    {
      name: "모바일",
      viewport: { width: 390, height: 844 },
      expandMapMenu: true,
    },
    {
      name: "접힌 줄",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: false,
    },
    {
      name: "펼침",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: true,
    },
  ];
  for (const place of PLACES) {
    test(`${place.name}: 버튼 옆 빈 자리는 지도가 받는다`, async ({ page }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await openMap(page);
      const result = await emptySpotMisses(
        page,
        ".ku-map-actions",
        ".ku-map-actions > *",
      );
      expect(result.checked).toBeGreaterThan(0);
      expect(result.misses).toEqual([]);
    });
  }

  test("웹에서 경사도 범례 위 빈 자리도 지도가 받는다", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    await setSlope(page, true);
    await expect(page.locator(".ku-slope-legend")).toBeVisible();
    const result = await emptySpotMisses(
      page,
      ".ku-map-corner",
      ".ku-slope-legend, .ku-map-actions > *",
    );
    expect(result.checked).toBeGreaterThan(0);
    expect(result.misses).toEqual([]);
  });

  test("360px 출처 표기 링크는 버튼 열에 가리지 않는다", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await openMap(page);
    for (const name of ["OpenStreetMap", "CARTO", "Leaflet"]) {
      const reachable = await page
        .locator(".ku-attribution a", { hasText: name })
        .evaluate((link) => {
          const rect = link.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return Boolean(hit && link.contains(hit));
        });
      expect(reachable, name).toBe(true);
    }
  });

  // 844×390은 좁은 화면이고, 1024×540은 확대 묶음만 빼는 웹 화면이다(docs/specs/2026-10-28-mobile-fixes-design.md 1.1)
  const LOW = [
    {
      name: "가로 휴대폰 844×390",
      layout: ".ku-menu-nav--bar",
      viewport: { width: 844, height: 390 },
      expandMapMenu: false,
    },
    {
      name: "낮은 웹 화면 1024×540 펼침",
      layout: ".ku-filter-panel",
      viewport: { width: 1024, height: 540 },
      expandMapMenu: true,
    },
  ];
  for (const place of LOW) {
    test(`${place.name}: 확대 버튼을 빼고 열이 언어 상자 아래에 있다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await openMap(page);
      await expect(page.locator(place.layout)).toBeVisible();
      await expect(page.locator(".ku-map-zoom")).toBeHidden();
      const languageBottom = await page
        .locator(".ku-language")
        .evaluate((element) => element.getBoundingClientRect().bottom);
      const tops = await page
        .locator(".ku-map-actions button")
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getClientRects().length > 0)
            .map((button) => button.getBoundingClientRect().top),
        );
      expect(tops.length).toBeGreaterThan(0);
      for (const top of tops)
        expect(top).toBeGreaterThanOrEqual(languageBottom);
    });
  }

  test("높이가 넉넉한 웹 화면에는 확대 버튼이 있다", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await openMap(page);
    await expect(page.locator(".ku-map-zoom")).toBeVisible();
  });
});
