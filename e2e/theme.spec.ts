import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-28-dark-mode-design.md 5.2

const DARK_BG = "rgb(21, 18, 16)";
const LIGHT_BG = "rgb(247, 245, 243)";
// 작업 화면은 이름표를 옅게 칠한다(admin-ui.css `.ku-map-workspace .bldg-label`). 다크 text-3는 rgb(167, 156, 148)
const LIGHT_TEXT_3 = "rgb(138, 131, 125)";
const WHITE = "rgb(255, 255, 255)";

function menuNav(page: Page) {
  return page.getByRole("navigation", { name: "지도 메뉴" });
}

function htmlTheme(page: Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

async function expectDark(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_BG);
  await expect(
    page.locator('.ku-map-shell .leaflet-tile[src*="/dark_all/"]').first(),
  ).toBeAttached();
  await expect(
    page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
  ).toHaveAttribute("fill", "#FF4D3D");
  expect(await page.evaluate(() => localStorage.getItem("ku_theme"))).toBe(
    "dark",
  );
}

async function expectLight(page: Page) {
  await expect.poll(() => htmlTheme(page)).toBeNull();
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);
  await expect(
    page.locator('.ku-map-shell .leaflet-tile[src*="/dark_all/"]'),
  ).toHaveCount(0);
  await expect(
    page.locator(".leaflet-overlay-pane path.leaflet-interactive").first(),
  ).toHaveAttribute("fill", "#963A32");
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

/** 글자를 직접 가진 보이는 요소의 글자색과, 화면에서 그 밑에 처음 깔린 불투명 바탕의 WCAG 대비(설계 5.2) */
async function lowContrast(page: Page, selector: string) {
  return page.evaluate((selector) => {
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
    // 절대 위치로 DOM 조상이 아닌 상자 위에 얹힌 글자(팝업 닫기 버튼)가 있어 DOM 조상보다 화면의 쌓임을 먼저 본다
    const backdrop = (element: Element): Rgba | null => {
      const rect = element.getBoundingClientRect();
      const stack = document.elementsFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      const index = stack.indexOf(element);
      const below =
        index >= 0
          ? stack.slice(index)
          : (() => {
              const chain: Element[] = [];
              for (
                let node: Element | null = element;
                node;
                node = node.parentElement
              )
                chain.push(node);
              return chain;
            })();
      for (const node of below) {
        const found = opaque(node);
        if (found !== undefined) return found;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const failures: string[] = [];
    for (const root of Array.from(document.querySelectorAll(selector))) {
      for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
        if (
          element.closest(
            ".leaflet-tile-pane, .leaflet-marker-pane, :disabled, [aria-disabled='true']",
          )
        )
          continue;
        const text = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join("")
          .trim();
        if (!text) continue;
        if (
          !element.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
          })
        )
          continue;
        const style = getComputedStyle(element);
        const foreground = parse(style.color);
        const background = backdrop(element);
        if (!foreground || !background) continue;
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
        const ratio = (high + 0.05) / (low + 0.05);
        const size = parseFloat(style.fontSize);
        const large =
          size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5))
          failures.push(
            `${element.tagName.toLowerCase()}.${element.getAttribute("class") ?? ""} "${text.slice(0, 20)}" ${ratio.toFixed(2)}`,
          );
      }
    }
    return failures;
  }, selector);
}

async function expectLabelFits(toggle: Locator, viewportWidth: number) {
  const fits = await toggle
    .locator(".ku-menu-label, .ku-map-action-label")
    .evaluate((label) => label.scrollWidth <= label.clientWidth);
  expect(fits, (await toggle.getAttribute("aria-label")) ?? "").toBe(true);
  const box = (await toggle.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 0.5);
}

test.describe("다크 모드 — 공개 지도", () => {
  test.use({ colorScheme: "dark" });

  test("기기가 다크여도 저장 값이 없으면 밝게 연다", async ({ page }) => {
    await installMockBackend(page);
    await page.goto("/");
    await expect(
      page
        .locator(".ku-map-actions")
        .getByRole("button", { name: "다크모드", exact: true }),
    ).toBeVisible();
    expect(await htmlTheme(page)).toBeNull();
    await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);
    await expect(
      page.locator('.leaflet-tile[src*="/light_all/"]').first(),
    ).toBeAttached();
    await expect(page.locator('.leaflet-tile[src*="/dark_all/"]')).toHaveCount(
      0,
    );
  });

  test("접힌 줄 맨 아래 토글은 열린 패널을 그대로 두고 모드를 오간다", async ({
    page,
  }) => {
    await installMockBackend(page, { expandMapMenu: false });
    await page.goto("/");
    const buttons = menuNav(page).getByRole("button");
    await expect(buttons.last()).toHaveAttribute("aria-label", "다크모드");
    await expect(buttons.last()).not.toHaveAttribute("aria-pressed", /.*/);
    await menuNav(page)
      .getByRole("button", { name: "필터", exact: true })
      .click();
    await expect(page.locator("#map-filter-panel")).toBeVisible();

    await buttons.last().click();
    await expectDark(page);
    await expect(buttons.last()).toHaveAttribute("aria-label", "라이트모드");
    await expect(buttons.last()).toBeFocused();
    await expect(page.locator("#map-filter-panel")).toBeVisible();

    await buttons.last().click();
    await expectLight(page);
    expect(await page.evaluate(() => localStorage.getItem("ku_theme"))).toBe(
      "light",
    );
  });

  test("펼친 모습은 지도 버튼 열의 위성 다음에 토글이 하나 있다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    // 지도가 늦게 불려 오므로 열이 그려진 뒤에 한 번에 읽는다
    await expect(page.locator(".ku-theme-toggle")).toBeVisible();
    const labels = await page
      .locator(".ku-map-actions")
      .getByRole("button")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("aria-label")),
      );
    expect(labels.slice(-3)).toEqual([
      "위성 지도로 전환",
      "다크모드",
      "피드백 보내기",
    ]);
    await expect(page.locator(".ku-theme-toggle")).toHaveCount(1);

    await page.locator(".ku-theme-toggle").click();
    await expectDark(page);
    await page.locator(".ku-theme-toggle").click();
    await expectLight(page);
  });

  test("모바일 아래 줄 오른쪽 끝 토글", async ({ page }) => {
    await installMockBackend(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const bar = page.locator(".ku-menu-nav--bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button")).toHaveCount(5);
    await expect(bar.getByRole("button").last()).toHaveAttribute(
      "aria-label",
      "다크모드",
    );
    await expect(page.locator(".ku-theme-toggle")).toHaveCount(1);

    await bar.getByRole("button").last().click();
    await expectDark(page);
  });

  test("저장된 다크는 앱 JS 없이도 첫 그리기 전에 걸린다", async ({ page }) => {
    await installMockBackend(page, { theme: "dark" });
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await htmlTheme(page)).toBe("dark");
    await expect(page.locator("body")).toHaveCSS("background-color", DARK_BG);
  });

  test("저장된 다크로 열면 첫 타일 요청부터 어둡고 hydration 경고가 없다", async ({
    page,
  }) => {
    const tiles: string[] = [];
    const warnings: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("basemaps.cartocdn.com"))
        tiles.push(request.url());
    });
    page.on("console", (message) => {
      if (/hydrat/i.test(message.text())) warnings.push(message.text());
    });
    await installMockBackend(page, { theme: "dark" });
    await page.goto("/");
    await expect(page.locator(".ku-theme-toggle")).toHaveAttribute(
      "aria-label",
      "라이트모드",
    );
    await expect(
      page.locator('.leaflet-tile[src*="/dark_all/"]').first(),
    ).toBeAttached();
    await expect.poll(() => tiles.length).toBeGreaterThan(0);
    expect(tiles.filter((url) => url.includes("/light_all/"))).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("저장소가 예외를 던져도 밝게 열리고 토글은 화면을 바꾼다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === "ku_theme") throw new Error("blocked");
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "ku_theme") throw new Error("blocked");
        return setItem.call(this, key, value);
      };
    });
    await installMockBackend(page);
    await page.goto("/");
    await expect(page.locator(".ku-theme-toggle")).toBeVisible();
    expect(await htmlTheme(page)).toBeNull();

    await page.locator(".ku-theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
  });

  const TOGGLE_NAMES = {
    ko: ["다크모드", "라이트모드"],
    en: ["Dark mode", "Light mode"],
    zh: ["深色模式", "浅色模式"],
  } as const;
  const LABEL_PLACES = [
    { name: "접힌 줄", width: 1280, height: 800, expandMapMenu: false },
    { name: "펼침", width: 1280, height: 800, expandMapMenu: true },
    { name: "아래 줄", width: 360, height: 780, expandMapMenu: true },
  ];
  for (const lang of ["ko", "en", "zh"] as const) {
    for (const place of LABEL_PLACES) {
      test(`${lang} ${place.name}: 토글 글자가 두 이름 모두 잘리지 않는다`, async ({
        page,
      }) => {
        await page.addInitScript(
          (value) => localStorage.setItem("ku_map_lang", value),
          lang,
        );
        await installMockBackend(page, { expandMapMenu: place.expandMapMenu });
        await page.setViewportSize({
          width: place.width,
          height: place.height,
        });
        await page.goto("/");
        const toggle = page.locator(".ku-theme-toggle");
        const [toDark, toLight] = TOGGLE_NAMES[lang];
        // 언어는 첫 그리기 뒤에 바뀐다 — 그 언어 이름이 된 뒤에 잰다
        await expect(toggle).toHaveAttribute("aria-label", toDark);
        await expectLabelFits(toggle, place.width);
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-label", toLight);
        await expectLabelFits(toggle, place.width);
      });
    }
  }

  test("공개 등록 요청 모달의 지도는 테마를 따른다", async ({ page }) => {
    await installMockBackend(page, { theme: "dark" });
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    const dialog = page.getByRole("dialog", { name: "시설 등록 요청" });
    await expect(
      dialog.locator('.leaflet-tile[src*="/dark_all/"]').first(),
    ).toBeAttached();
    await expect(dialog.locator(".ku-light-scope")).toHaveCount(0);
  });

  test("다크에서 공개 화면 글자가 대비 기준을 지킨다", async ({ page }) => {
    await seedFavorite(page);
    await installMockBackend(page, { theme: "dark", expandMapMenu: false });
    await page.goto("/");
    const nav = menuNav(page);
    const check = async (label: string, selector: string) => {
      const failures = await lowContrast(page, selector);
      expect(failures, `${label}: ${failures.join(", ")}`).toEqual([]);
    };

    await check("접힌 줄", ".ku-menu-nav--rail");
    await nav.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByPlaceholder("건물 검색...").fill("중앙");
    await expect(page.getByRole("option").first()).toBeVisible();
    await check("검색", ".ku-menu-panel");
    await nav.getByRole("button", { name: "필터", exact: true }).click();
    await check("필터", ".ku-menu-panel");
    await nav.getByRole("button", { name: /^즐겨찾기/ }).click();
    await check("즐겨찾기", ".ku-menu-panel");
    await nav.getByRole("button", { name: /^목록/ }).click();
    await check("목록", ".ku-menu-panel");

    await nav.getByRole("button", { name: "필터", exact: true }).click();
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="facility-marker-f-installed"]').click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await check("시설 팝업", ".leaflet-popup");
    await page.locator(".leaflet-popup-close-button").click();
    // 닫힌 팝업은 0.2초 동안 흐려지며 남는다(Leaflet 페이드) — 다음 팝업과 겹쳐 잡히지 않게 기다린다
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    await page.locator('[data-testid^="landmark-marker-"]').first().click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await check("명소 팝업", ".leaflet-popup");
    await page.locator(".leaflet-popup-close-button").click();
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    await page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]').click();
    await expect(page.locator(".leaflet-popup")).toContainText("정문-중앙광장");
    await check("경사도 팝업", ".leaflet-popup");
    await page.locator(".leaflet-popup-close-button").click();
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);

    await nav.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    await expect(page.locator(".ku-side-panel")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await check("건물 상세", ".ku-side-panel");

    await page.getByRole("button", { name: "시설 등록 요청" }).click();
    await expect(
      page.getByRole("dialog", { name: "시설 등록 요청" }),
    ).toBeVisible();
    await check("등록 요청", '[role="dialog"]');
    await page.keyboard.press("Escape");

    await page.getByTitle("피드백 보내기").click();
    await expect(
      page.getByRole("dialog", { name: "피드백 보내기" }),
    ).toBeVisible();
    await check("피드백", '[role="dialog"]');
  });
});

test.describe("다크 모드 — 관리자", () => {
  test("헤더 토글이 모드를 바꾸고 공개 지도와 저장 값을 같이 쓴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/buildings");
    const header = page.locator(".ku-admin-header");
    await header.getByRole("button", { name: "다크모드", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      header.getByRole("button", { name: "라이트모드", exact: true }),
    ).toBeFocused();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("390px ⋮ 메뉴 항목은 모드를 바꾸고 초점을 ⋮ 버튼으로 돌린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/buildings");
    const trigger = page.getByRole("button", { name: "계정 메뉴" });
    await trigger.click();
    await page.getByRole("menuitem", { name: "다크모드" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "계정 메뉴" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await trigger.click();
    await expect(
      page.getByRole("menuitem", { name: "라이트모드" }),
    ).toBeVisible();
  });

  for (const width of [768, 899, 900, 1280]) {
    test(`${width}px 헤더가 넘치지 않고 토글·로그아웃이 화면 안에 있다`, async ({
      page,
    }) => {
      await installMockBackend(page, { authenticated: true });
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/dashboard/buildings");
      const header = page.locator(".ku-admin-header");
      await expect(
        header.getByRole("button", { name: "다크모드", exact: true }),
      ).toBeVisible();
      expect(
        await header.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      for (const name of ["다크모드", "로그아웃"]) {
        const box = (await header
          .getByRole("button", { name, exact: true })
          .boundingBox())!;
        expect(box.x + box.width, name).toBeLessThanOrEqual(width);
      }
    });
  }

  test("다크에서도 관리자 지도는 밝다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true, theme: "dark" });
    const expectLightMap = async (label: string, map: Locator) => {
      await expect(
        map.locator('.leaflet-tile[src*="/light_all/"]').first(),
        label,
      ).toBeAttached();
      await expect(
        map.locator('.leaflet-tile[src*="/dark_all/"]'),
        label,
      ).toHaveCount(0);
      await expect(map.locator(".leaflet-tile-pane").first(), label).toHaveCSS(
        "filter",
        "none",
      );
    };

    for (const path of [
      "/admin/dashboard/facilities",
      "/admin/dashboard/landmarks",
      "/admin/dashboard/slopes",
    ]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const map = page.locator(".leaflet-container.ku-light-scope").first();
      await expectLightMap(path, map);
      await expect(
        map.locator(".leaflet-control-zoom a").first(),
        path,
      ).toHaveCSS("background-color", WHITE);
      await expect(
        map.locator(".leaflet-tooltip.bldg-label").first(),
        path,
      ).toHaveCSS("color", LIGHT_TEXT_3);
    }
    await expect(page.locator("path.ku-slope-casing").first()).toHaveAttribute(
      "stroke",
      "#1C1917",
    );

    await page.goto("/admin/dashboard/slopes?id=2&edit=1");
    await expectLightMap("경로 수정", page.locator(".ku-slope-route-map"));
    await expect(
      page.locator(".leaflet-pane.slope-preview-pane path.ku-slope-casing"),
    ).toHaveAttribute("stroke", "#1C1917");

    await page.goto("/admin/buildings/new");
    await expectLightMap(
      "폴리곤 편집",
      page.locator(".leaflet-container.ku-light-scope").first(),
    );

    await page.goto("/admin/buildings/1");
    await expectLightMap(
      "미리보기",
      page.getByRole("img", { name: "건물 폴리곤 미리보기" }),
    );
    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    await expectLightMap(
      "시설 폼",
      page.getByRole("dialog").locator(".ku-light-scope"),
    );
  });
});
