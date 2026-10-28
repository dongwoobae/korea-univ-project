import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-28-mobile-fixes-design.md 7.1

const LANDSCAPE = [
  { width: 740, height: 360 },
  { width: 844, height: 390 },
];

function menuNav(page: Page) {
  return page.getByRole("navigation", { name: "지도 메뉴" });
}

function menuButton(page: Page, name: string | RegExp) {
  return menuNav(page).getByRole("button", {
    name,
    exact: typeof name === "string",
  });
}

/** check()·uncheck()처럼 누르기 전과 뒤의 상태를 함께 본다 */
async function setSlope(page: Page, on: boolean) {
  const button = page
    .locator(".ku-map-actions")
    .getByRole("button", { name: "경사도", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", String(!on));
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(on));
}

/** 로딩 막을 기다리는 까닭은 e2e/font-scale.spec.ts의 openMap. 글자 크기 줄은 언어와 상관없이 지도와 함께 붙는다 */
async function openMap(page: Page) {
  await page.goto("/");
  await expect(page.locator(".ku-font-scale")).toBeVisible();
  await expect(page.locator(".ku-map-loading")).toHaveCount(0);
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

async function openLibrary(page: Page) {
  await menuButton(page, "검색").click();
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByRole("option").filter({ hasText: "중앙도서관" }).click();
  await expect(page.locator(".ku-side-panel")).toHaveAttribute(
    "data-visible",
    "true",
  );
}

async function openFavoriteLibrary(page: Page) {
  await menuButton(page, /^즐겨찾기/).click();
  await page.locator(".ku-favorite-row", { hasText: "중앙도서관" }).click();
  await expect(page.locator(".ku-side-panel")).toHaveAttribute(
    "data-visible",
    "true",
  );
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

function visibleActionBoxes(page: Page) {
  return page.locator(".ku-map-actions > *").evaluateAll((elements) =>
    elements
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
  );
}

async function settledBox(locator: Locator) {
  let previous: string | undefined;
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await locator.boundingBox());
        const settled = current === previous && current !== "null";
        previous = current;
        return settled;
      },
      { intervals: [250] },
    )
    .toBe(true);
  return (await locator.boundingBox())!;
}

async function expectAtLeast24(locator: Locator, label: string) {
  const sizes = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(sizes.length, label).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, label).toBeGreaterThanOrEqual(24);
    expect(size.height, label).toBeGreaterThanOrEqual(24);
  }
}

/** 글자색과 화면에서 그 밑에 처음 깔린 불투명 바탕의 WCAG 대비. 셈은 e2e/theme.spec.ts의 lowContrast를 한 요소에 한다 */
function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba | null => {
      const rgb = value.match(/^rgba?\(([^)]+)\)$/);
      if (rgb) {
        const [r, g, b, a = 1] = rgb[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number);
        return { r, g, b, a };
      }
      const srgb = value.match(/^color\(srgb ([^)]+)\)$/);
      if (srgb) {
        const [r, g, b, a = 1] = srgb[1]
          .split(/[\s/]+/)
          .filter(Boolean)
          .map(Number);
        return { r: r * 255, g: g * 255, b: b * 255, a };
      }
      return null;
    };
    const luminance = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const opaque = (node: Element): Rgba | null | undefined => {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      const background = parse(style.backgroundColor);
      return background && background.a >= 0.9 ? background : undefined;
    };
    const rect = element.getBoundingClientRect();
    const stack = document.elementsFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const index = stack.indexOf(element);
    const below: Element[] = index >= 0 ? stack.slice(index) : [];
    if (index < 0)
      for (let node: Element | null = element; node; node = node.parentElement)
        below.push(node);
    let background: Rgba | null = { r: 255, g: 255, b: 255, a: 1 };
    for (const node of below) {
      const found = opaque(node);
      if (found !== undefined) {
        background = found;
        break;
      }
    }
    const foreground = parse(getComputedStyle(element).color);
    if (!foreground || !background) return null;
    const mix = (f: number, b: number) =>
      f * foreground.a + b * (1 - foreground.a);
    const shown = {
      r: mix(foreground.r, background.r),
      g: mix(foreground.g, background.g),
      b: mix(foreground.b, background.b),
      a: 1,
    };
    const [high, low] = [luminance(shown), luminance(background)].sort(
      (x, y) => y - x,
    );
    return (high + 0.05) / (low + 0.05);
  });
}

/** 기본 지우기 버튼은 입력의 user-agent 그림자 트리 안의 요소라 페이지 JS(getComputedStyle 포함)로 그 계산값을 읽지 못한다.
 * CDP로 찾아 읽는다 */
async function searchCancelButtonStyle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  type DomNode = typeof root;
  const attribute = (node: DomNode, name: string) => {
    const list = node.attributes ?? [];
    for (let i = 0; i < list.length; i += 2)
      if (list[i] === name) return list[i + 1];
    return undefined;
  };
  const find = (
    node: DomNode,
    match: (node: DomNode) => boolean,
  ): DomNode | undefined => {
    if (match(node)) return node;
    for (const child of [
      ...(node.shadowRoots ?? []),
      ...(node.children ?? []),
    ]) {
      const found = find(child, match);
      if (found) return found;
    }
    return undefined;
  };
  const input = find(
    root,
    (node) =>
      node.nodeName === "INPUT" &&
      (attribute(node, "class") ?? "").split(/\s+/).includes("ku-search-input"),
  );
  const button =
    input &&
    find(
      input,
      (node) =>
        attribute(node, "pseudo") === "-webkit-search-cancel-button" ||
        attribute(node, "id") === "search-clear",
    );
  expect(button, "검색창의 기본 지우기 버튼").toBeTruthy();
  const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", {
    nodeId: button!.nodeId,
  });
  await cdp.detach();
  const value = (name: string) =>
    computedStyle.find((property) => property.name === name)?.value;
  return { appearance: value("appearance"), display: value("display") };
}

test.describe("가로 좁은 화면(설계 1.2)", () => {
  for (const viewport of LANDSCAPE) {
    const size = `${viewport.width}×${viewport.height}`;

    test(`${size}: 아래 줄만 있고 지도 버튼은 언어 버튼 아래 가로 한 줄이다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: false });
      await page.setViewportSize(viewport);
      await openMap(page);
      await expect(page.locator(".ku-menu-nav--bar")).toBeVisible();
      await expect(page.locator(".ku-menu-nav--rail")).toHaveCount(0);

      const languageBottom = await page
        .locator(".ku-language-trigger")
        .evaluate((element) => element.getBoundingClientRect().bottom);
      const items = await visibleActionBoxes(page);
      expect(items.length).toBeGreaterThan(1);
      for (const [index, item] of items.entries()) {
        expect(item.top, "언어 버튼 아래").toBeGreaterThanOrEqual(
          languageBottom,
        );
        expect(
          Math.abs(item.bottom - items[0].bottom),
          "아래 끝이 같은 한 줄",
        ).toBeLessThanOrEqual(1);
        if (index > 0)
          expect(item.left, "왼쪽부터 DOM 차례").toBeGreaterThanOrEqual(
            items[index - 1].right,
          );
      }
    });

    test(`${size}: 상세는 화면 높이의 오른쪽 옆 패널이고 손잡이가 없다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: false });
      await page.setViewportSize(viewport);
      await openMap(page);
      await openLibrary(page);
      const panel = await settledBox(page.locator(".ku-side-panel"));
      expect(
        Math.abs(panel.x + panel.width - viewport.width),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(panel.height - viewport.height)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(panel.width - Math.min(360, viewport.width / 2)),
      ).toBeLessThanOrEqual(1);
      await expect(page.locator(".ku-side-handle")).toBeHidden();
    });

    test(`${size}: 경사도 범례는 버튼 줄 위에 있어 겹치지 않는다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: false });
      await page.setViewportSize(viewport);
      await openMap(page);
      await setSlope(page, true);
      const legend = page.locator(".ku-slope-legend");
      await expect(legend).toBeVisible();
      const legendBottom = await legend.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      );
      const rowTop = Math.min(
        ...(await visibleActionBoxes(page)).map((item) => item.top),
      );
      expect(legendBottom).toBeLessThanOrEqual(rowTop);
    });
  }

  test("667×375: 6구간에서도 범례 눈금끼리 겹치지 않는다", async ({ page }) => {
    const state = await installMockBackend(page);
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
    await page.setViewportSize({ width: 667, height: 375 });
    await openMap(page);
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
  });
});

test.describe("웹·세로 좁은 화면은 지금 배치 그대로다", () => {
  test("웹 1280×800 접힌 줄: 메뉴는 왼쪽 접힌 줄이고 상세는 오른쪽 패널이다", async ({
    page,
  }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    await expect(page.locator(".ku-menu-nav--rail")).toBeVisible();
    await expect(page.locator(".ku-menu-nav--bar")).toHaveCount(0);
    await openLibrary(page);
    const panel = await settledBox(page.locator(".ku-side-panel"));
    expect(Math.abs(panel.x + panel.width - 1280)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.height - 800)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.width - 340)).toBeLessThanOrEqual(1);
    await expect(page.locator(".ku-side-handle")).toBeHidden();
  });

  test("웹 1280×800 펼침: 펼친 패널이 있고 메뉴 줄이 없다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    await expect(page.locator(".ku-filter-panel")).toBeVisible();
    await expect(page.locator(".ku-search-control")).toBeVisible();
    await expect(page.locator(".ku-menu-nav")).toHaveCount(0);
  });

  test("세로 390×844: 아래 줄이 있고 상세는 손잡이가 달린 아래 시트다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openMap(page);
    await expect(page.locator(".ku-menu-nav--bar")).toBeVisible();
    await expect(page.locator(".ku-menu-nav--rail")).toHaveCount(0);
    await openLibrary(page);
    const panel = await settledBox(page.locator(".ku-side-panel"));
    expect(Math.abs(panel.y + panel.height - 844)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.width - 390)).toBeLessThanOrEqual(1);
    await expect(page.locator(".ku-side-handle")).toBeVisible();
  });
});

test.describe("경사도 버튼(설계 2장)", () => {
  const PLACES = [
    {
      name: "웹 접힌 줄",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: false,
    },
    {
      name: "웹 펼침",
      viewport: { width: 1280, height: 800 },
      expandMapMenu: true,
    },
    {
      name: "세로 좁은 화면",
      viewport: { width: 390, height: 844 },
      expandMapMenu: true,
    },
  ];
  for (const place of PLACES) {
    test(`${place.name}: 위성 바로 다음에 있고 누르면 선과 범례가 켜지며 다시 누르면 꺼진다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await openMap(page);
      const names = await visibleActionNames(page);
      const satellite = names.indexOf("위성 지도로 전환");
      expect(satellite, names.join(", ")).toBeGreaterThanOrEqual(0);
      expect(names[satellite + 1], names.join(", ")).toBe("경사도");

      const legend = page.locator(".ku-slope-legend");
      // 목 경로 1(3°)은 기본 범례 첫 구간 색으로 그려진다
      const line = page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]');
      await expect(legend).toHaveCount(0);
      await setSlope(page, true);
      await expect(legend).toBeVisible();
      await expect(line).toHaveCount(1);
      await setSlope(page, false);
      await expect(legend).toHaveCount(0);
      await expect(line).toHaveCount(0);
    });
  }

  for (const place of [PLACES[0], PLACES[2]]) {
    test(`${place.name}: 경사도를 켜도 필터 이름에 숫자가 붙지 않고 필터 패널에 경사도 체크가 없다`, async ({
      page,
    }) => {
      await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
      await page.setViewportSize(place.viewport);
      await openMap(page);
      await setSlope(page, true);
      const filter = menuButton(page, /^필터/);
      await expect(filter).toHaveAttribute("aria-label", "필터");
      await filter.click();
      await expect(page.getByRole("checkbox", { name: /명소/ })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: /경사도/ })).toHaveCount(
        0,
      );
    });
  }

  test("웹 펼침: 필터 칸에 경사도 체크가 없다", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    const filter = page.locator(".ku-filter-panel");
    await expect(filter.getByRole("checkbox", { name: /명소/ })).toBeVisible();
    await expect(filter.getByRole("checkbox", { name: /경사도/ })).toHaveCount(
      0,
    );
  });
});

test.describe("MOB-09 검색·즐겨찾기로 고른 건물", () => {
  const PLACES = [
    {
      name: "세로 360×780",
      viewport: { width: 360, height: 780 },
      edge: "top",
    },
    {
      name: "세로 390×844",
      viewport: { width: 390, height: 844 },
      edge: "top",
    },
    {
      name: "세로 430×932",
      viewport: { width: 430, height: 932 },
      edge: "top",
    },
    {
      name: "가로 740×360",
      viewport: { width: 740, height: 360 },
      edge: "left",
    },
    {
      name: "웹 1280×800",
      viewport: { width: 1280, height: 800 },
      edge: "left",
    },
  ];
  const PICKS = [
    { name: "검색", open: openLibrary },
    { name: "즐겨찾기", open: openFavoriteLibrary },
  ];
  for (const place of PLACES) {
    for (const pick of PICKS) {
      test(`${place.name} ${pick.name}: 선택된 이름이 상세에 가리지 않는다`, async ({
        page,
      }) => {
        await seedFavorite(page);
        await installMockBackend(page, { expandMapMenu: false });
        await page.setViewportSize(place.viewport);
        await openMap(page);
        await pick.open(page);
        const panel = await settledBox(page.locator(".ku-side-panel"));
        const label = await settledBox(
          page.locator(".ku-building-label--selected"),
        );
        if (place.edge === "top")
          expect(label.y + label.height / 2).toBeLessThan(panel.y);
        else expect(label.x + label.width / 2).toBeLessThan(panel.x);
      });
    }
  }
});

test("MOB-10 390×844: 검색 결과 수 글자가 바탕과 4.5:1 이상 대비된다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);
  await menuButton(page, "검색").click();
  await page.getByPlaceholder("건물 검색...").fill("중앙");
  const count = page.locator(".ku-search-count");
  await expect(count).toHaveText(/\d+개 결과/);
  expect(await contrastRatio(count)).toBeGreaterThanOrEqual(4.5);
});

test("MOB-11 검색창에 브라우저 기본 지우기 버튼이 그려지지 않는다", async ({
  page,
}) => {
  await installMockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);
  await menuButton(page, "검색").click();
  await page.getByPlaceholder("건물 검색...").fill("중앙");
  const style = await searchCancelButtonStyle(page);
  expect(
    style.appearance === "none" || style.display === "none",
    JSON.stringify(style),
  ).toBe(true);
});

test.describe("MOB-12 등록 요청 모달 위쪽 닫기", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function openRequest(page: Page) {
    await installMockBackend(page);
    await openMap(page);
    await openLibrary(page);
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expect(dialog).toBeVisible();
    const close = dialog
      .locator(".ku-request-modal-header")
      .getByRole("button", { name: "닫기", exact: true });
    await expect(close).toBeVisible();
    return { dialog, close };
  }

  test("제목 줄의 닫기를 누르면 모달이 닫힌다", async ({ page }) => {
    const { dialog, close } = await openRequest(page);
    await close.click();
    await expect(dialog).toHaveCount(0);
  });

  test("Tab으로 제목 줄의 닫기에 닿는다", async ({ page }) => {
    const { dialog, close } = await openRequest(page);
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    let reached = false;
    for (let press = 0; press < 100 && !reached; press++) {
      await page.keyboard.press("Tab");
      reached = await close.evaluate(
        (element) => element === document.activeElement,
      );
    }
    expect(reached).toBe(true);
  });
});

test("MOB-13 다크에서 출처 표기 로고 뒤 바탕이 흰색이다", async ({ page }) => {
  await installMockBackend(page, { theme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);
  await expect(page.locator(".ku-attribution img")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

for (const viewport of [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
]) {
  test(`MOB-14 ${viewport.width}×${viewport.height}: 접힌 메뉴 줄 대신 아래 줄이다`, async ({
    page,
  }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.setViewportSize(viewport);
    await openMap(page);
    await expect(page.locator(".ku-menu-nav--bar")).toBeVisible();
    await expect(page.locator(".ku-menu-nav--rail")).toHaveCount(0);
  });
}

test("MOB-16 영어 360×780 크게: 목록의 긴 이름은 두 줄까지 보인다", async ({
  page,
}) => {
  const longName = "Hana Square Underground Accessible Entrance Plaza";
  await page.addInitScript(() => localStorage.setItem("ku_map_lang", "en"));
  const state = await installMockBackend(page, { fontScale: "large" });
  state.landmarks.push({
    ...state.landmarks[0],
    id: "22222222-2222-2222-2222-222222222222",
    name: "하나스퀘어 지하 무장애 출입 광장",
    name_en: longName,
    name_zh: null,
    lat: 37.5892,
    lng: 127.0326,
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openMap(page);
  await page
    .locator(".ku-menu-nav--bar")
    .getByRole("button", { name: /^List/ })
    .click();
  const names = page.locator(".ku-menu-panel .ku-map-browse-copy strong");
  const height = (text: string) =>
    names
      .filter({ hasText: text })
      .evaluate((element) => element.getBoundingClientRect().height);
  const oneLine = await height("Squirrel Trail");
  const long = await height(longName);
  expect(long).toBeGreaterThan(oneLine + 1);
  expect(long).toBeLessThan(oneLine * 3 - 1);
});

test.describe("MOB-05 세로 390 터치 대상 24×24", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("경사도 범례 칸", async ({ page }) => {
    await installMockBackend(page);
    await openMap(page);
    await setSlope(page, true);
    const cells = page.locator(".ku-slope-bands-cell");
    await expect(cells.first()).toBeVisible();
    await expectAtLeast24(cells, "범례 칸");
  });

  test("사진 넘김 점과 시트 손잡이", async ({ page }) => {
    const state = await installMockBackend(page);
    state.photos.push({
      id: 2,
      building_id: 1,
      url: "https://cdn.test/library-2.webp?t=1700000000001",
      caption: "열람실",
      caption_en: "Reading room",
      caption_zh: "阅览室",
      sort_order: 1,
    });
    await openMap(page);
    await openLibrary(page);
    const dots = page
      .locator(".ku-side-panel")
      .getByRole("button", { name: /^\d+번째 사진$/ });
    await expect(dots).toHaveCount(2);
    await expectAtLeast24(dots, "사진 넘김 점");
    await expectAtLeast24(page.locator(".ku-side-handle"), "시트 손잡이");
  });
});
