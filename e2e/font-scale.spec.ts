import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-28-font-scale-design.md 5.2

const LARGE = 1.2;

type Target = [string, Locator];
type Box = { x: number; y: number; width: number; height: number };

function scaleGroup(page: Page, name = "글자 크기") {
  return page.getByRole("group", { name, exact: true });
}

function smaller(page: Page) {
  return scaleGroup(page).getByRole("button", {
    name: "글자 작게",
    exact: true,
  });
}

function larger(page: Page) {
  return scaleGroup(page).getByRole("button", {
    name: "글자 크게",
    exact: true,
  });
}

function scaleStatus(page: Page) {
  return scaleGroup(page).locator('[aria-live="polite"]');
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

/** 보통에서 잰 뒤 크게로 바꿔 1.2배인지 보고 보통으로 되돌린다. 버튼을 누르면 닫히는 것은 restore로 다시 연다 */
async function expectScaled(
  page: Page,
  targets: Target[],
  restore?: () => Promise<void>,
) {
  const normal = await measure(targets);
  await larger(page).click();
  await restore?.();
  await expectSizes(
    targets,
    normal.map((size) => size * LARGE),
  );
  await smaller(page).click();
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
  await larger(page).click();
  await open();
  await expectSizes(
    targets(),
    normal.map((size) => size * LARGE),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await smaller(page).click();
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
  test("처음에는 보통이고 두 버튼이 모두 눌리며 지금 단계를 가리킨다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await expect(scaleGroup(page)).toBeVisible();
    expect(await htmlScale(page)).toBeNull();
    await expect(scaleStatus(page)).toHaveText("글자 크기: 보통");
    const statusId = await scaleStatus(page).getAttribute("id");
    expect(statusId).toBeTruthy();
    await expect(smaller(page)).toHaveText("가−");
    await expect(larger(page)).toHaveText("가＋");
    for (const button of [smaller(page), larger(page)]) {
      await expect(button).not.toHaveAttribute("aria-disabled", "true");
      await expect(button).toHaveAttribute("aria-describedby", statusId!);
    }
  });

  const PLACES = [
    {
      name: "접힌 줄",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: false,
      names: ["위성 지도로 전환", "글자 작게", "글자 크게", "피드백 보내기"],
      whole: false,
    },
    {
      name: "펼침",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: true,
      names: [
        "위성 지도로 전환",
        "다크모드",
        "글자 작게",
        "글자 크게",
        "피드백 보내기",
      ],
      whole: false,
    },
    {
      name: "모바일",
      viewport: { width: 390, height: 844 },
      expandMapMenu: true,
      names: [
        "글자 작게",
        "글자 크게",
        "현 위치",
        "위성 지도로 전환",
        "피드백 보내기",
      ],
      whole: true,
    },
  ];
  for (const place of PLACES) {
    test(`${place.name}: 자리와 한 단계씩 이동, 끝 단계에서도 초점이 남는다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await page.goto("/");
      await expect(scaleGroup(page)).toBeVisible();
      const names = await visibleActionNames(page);
      expect(place.whole ? names : names.slice(-place.names.length)).toEqual(
        place.names,
      );

      const panel = page.locator(".ku-menu-panel");
      if (!place.expandMapMenu) {
        await menuNav(page)
          .getByRole("button", { name: "필터", exact: true })
          .click();
        await expect(panel).toBeVisible();
      }

      await larger(page).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "large",
      );
      expect(await storedScale(page)).toBe("large");
      await expect(larger(page)).toHaveAttribute("aria-disabled", "true");
      await expect(larger(page)).toBeFocused();
      await expect(scaleStatus(page)).toHaveText("글자 크기: 크게");
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "large",
      );

      await smaller(page).click();
      await expect.poll(() => htmlScale(page)).toBeNull();
      expect(await storedScale(page)).toBe("normal");
      await smaller(page).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "small",
      );
      await expect(smaller(page)).toHaveAttribute("aria-disabled", "true");
      await expect(scaleStatus(page)).toHaveText("글자 크기: 작게");
      // Playwright는 aria-disabled 버튼을 누를 수 없는 것으로 보고 클릭을 기다린다 — 키보드로 누른다
      await smaller(page).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "small",
      );
      await expect(smaller(page)).toBeFocused();
      if (!place.expandMapMenu) await expect(panel).toBeVisible();
    });
  }

  const LANG_NAMES = {
    en: {
      group: "Text size",
      down: "Smaller text",
      up: "Larger text",
      downGlyph: "A−",
      upGlyph: "A＋",
      normal: "Text size: Normal",
    },
    zh: {
      group: "字号",
      down: "缩小字号",
      up: "放大字号",
      downGlyph: "字−",
      upGlyph: "字＋",
      normal: "字号：标准",
    },
  } as const;
  for (const [lang, names] of Object.entries(LANG_NAMES)) {
    test(`${lang}: 버튼 글자·이름·지금 단계`, async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("ku_map_lang", value),
        lang,
      );
      await installMockBackend(page);
      await page.goto("/");
      const group = scaleGroup(page, names.group);
      await expect(
        group.getByRole("button", { name: names.down, exact: true }),
      ).toHaveText(names.downGlyph);
      await expect(
        group.getByRole("button", { name: names.up, exact: true }),
      ).toHaveText(names.upGlyph);
      await expect(group.locator('[aria-live="polite"]')).toHaveText(
        names.normal,
      );
    });
  }

  test("저장된 크게는 앱 JS 없이도 첫 그리기 전에 걸리고 다크도 함께 걸린다", async ({
    page,
  }) => {
    await installMockBackend(page, { fontScale: "large", theme: "dark" });
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await htmlScale(page)).toBe("large");
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      ),
    ).toBe("dark");
  });

  test("저장소가 예외를 던져도 보통으로 열리고 버튼은 화면을 바꾼다", async ({
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
    await expect(scaleGroup(page)).toBeVisible();
    expect(await htmlScale(page)).toBeNull();

    await larger(page).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "large",
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
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await page.keyboard.press("Escape");
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
    await menuNav(page)
      .getByRole("button", { name: "필터", exact: true })
      .click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await page.keyboard.press("Escape");
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
    await menuNav(page)
      .getByRole("button", { name: "필터", exact: true })
      .click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await page.keyboard.press("Escape");
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
      ["글자 크게 버튼", larger(page)],
    ];
    const normal = await measure(targets);
    await larger(page).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "large",
    );
    await expectSizes(targets, normal);
  });

  test("관리자 화면 글자는 저장 값이 크게여도 그대로다", async ({ page }) => {
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
    await page.evaluate(() => localStorage.setItem("ku_font_scale", "large"));
    const large = await sample();
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "large",
    );
    expect(large).toEqual(normal);
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
      // 마우스를 건물 위에 둔 채 키보드로 누른다
      await larger(page).focus();
      await page.keyboard.press("Enter");
      await expectEmphasized(label, "13.2px");
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
      await larger(page).click();
      await expectEmphasized(label, "13.2px");
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

    await larger(page).click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expect
      .poll(() => fontPx(content.locator(":scope > div").first()))
      .toBeCloseTo(13 * LARGE, 1);
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

test.describe("글자 크기 — 모바일 360px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  async function expectNoHorizontalOverflow(label: string, locator: Locator) {
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
  }

  test("크게: 메뉴 줄 이름은 그대로고 패널·칩·범례가 넘치지 않으며 버튼 줄이 범례를 덮지 않는다", async ({
    page,
  }) => {
    await seedFavorite(page);
    await installMockBackend(page, { fontScale: "large" });
    await page.goto("/");
    const nav = menuNav(page);
    await expect(nav).toBeVisible();
    expect(await fontPx(nav.getByRole("button").first())).toBe(12);
    const panel = page.locator(".ku-menu-panel");
    for (const { name, filter } of [
      { name: /^검색/, filter: false },
      { name: /^필터/, filter: true },
      { name: /^즐겨찾기/, filter: false },
      { name: /^목록/, filter: false },
    ]) {
      await nav.getByRole("button", { name }).click();
      await expect(panel).toBeVisible();
      await expectNoHorizontalOverflow(String(name), panel);
      if (filter) {
        await panel
          .getByRole("button", { name: "캠퍼스 영역", exact: true })
          .click();
        await panel.getByRole("button", { name: "시설", exact: true }).click();
        await expect(panel.locator(".ku-chip").first()).toBeVisible();
        expect(await panel.locator(".ku-chip").count()).toBeGreaterThan(0);
        await expectNoHorizontalOverflow("필터(칸 연 뒤)", panel);
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
        await page.getByRole("checkbox", { name: /경사도/ }).check();
      }
      await nav.getByRole("button", { name }).click();
      await expect(panel).toHaveCount(0);
    }
    const legend = page.locator(".ku-slope-legend");
    await expect(legend).toBeVisible();
    await expectNoHorizontalOverflow("범례", legend);
    expect(
      overlaps(
        (await legend.boundingBox())!,
        (await scaleGroup(page).boundingBox())!,
      ),
    ).toBe(false);
  });

  test("크게: 상세 시트와 등록 요청·피드백 모달이 넘치지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { fontScale: "large" });
    await page.goto("/");
    await menuNav(page).getByRole("button", { name: /^검색/ }).click();
    await openLibraryDetail(page);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(
      "건물 상세",
      page.locator(".ku-side-panel"),
    );

    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const request = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expect(request).toBeVisible();
    await expectNoHorizontalOverflow("등록 요청", request);
    await page.keyboard.press("Escape");
    await page.locator(".ku-side-close").click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);

    await page.getByTitle("피드백 보내기").click();
    const feedback = page.getByRole("dialog", { name: "피드백 보내기" });
    await expect(feedback).toBeVisible();
    await expectNoHorizontalOverflow("피드백", feedback);
  });

  test("작게에서도 검색창은 16px다", async ({ page }) => {
    await installMockBackend(page, { fontScale: "small" });
    await page.goto("/");
    await menuNav(page).getByRole("button", { name: /^검색/ }).click();
    expect(await fontPx(page.getByPlaceholder("건물 검색..."))).toBe(16);
  });
});

test("가로 모드 667×375에서 버튼 줄이 언어 버튼과 겹치지 않는다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/");
  const row = (await scaleGroup(page).boundingBox())!;
  const language = (await page.locator(".ku-language-trigger").boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(0);
  expect(overlaps(row, language)).toBe(false);
});

test("크게에서도 범례 눈금끼리 겹치지 않는다", async ({ page }) => {
  const state = await installMockBackend(page, { fontScale: "large" });
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
    const mobile = viewport.width < 768;
    await page.setViewportSize(viewport);
    await page.goto("/");
    const filter = menuNav(page).getByRole("button", { name: /^필터/ });
    if (mobile) await filter.click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    if (mobile) await filter.click();
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
      await page.goto("/");
      // 데이터를 불러오는 동안 로딩 막(.ku-map-loading)이 지도를 덮어 지도 대신 잡힌다
      await expect(page.locator(".ku-map-loading")).toHaveCount(0);
      await expect(scaleGroup(page)).toBeVisible();
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
    await page.goto("/");
    await expect(page.locator(".ku-map-loading")).toHaveCount(0);
    await page.getByRole("checkbox", { name: /경사도/ }).check();
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
    await page.goto("/");
    await expect(page.locator(".ku-map-loading")).toHaveCount(0);
    await expect(scaleGroup(page)).toBeVisible();
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

  const LOW = [
    { width: 844, height: 390, expandMapMenu: false },
    { width: 844, height: 390, expandMapMenu: true },
    { width: 1024, height: 460, expandMapMenu: true },
  ];
  for (const place of LOW) {
    test(`낮은 웹 화면 ${place.width}×${place.height}${place.expandMapMenu ? " 펼침" : ""}: 확대 버튼을 빼고 열이 언어 상자 아래에 있다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place);
      await page.goto("/");
      await expect(page.locator(".ku-map-loading")).toHaveCount(0);
      await expect(scaleGroup(page)).toBeVisible();
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
    await page.goto("/");
    await expect(page.locator(".ku-map-loading")).toHaveCount(0);
    await expect(page.locator(".ku-map-zoom")).toBeVisible();
  });
});
