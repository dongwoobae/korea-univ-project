import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-27-map-menu-design.md

const PHONES = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 740, height: 360 },
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

async function seedCollapsed(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("ku_menu_collapsed", "true"),
  );
}

async function seedFavorites(page: Page, count = 1) {
  const favorites =
    count === 1
      ? [{ id: 1, name: "중앙도서관", name_en: "Central Library" }]
      : Array.from({ length: count }, (_, index) => ({
          id: index + 1,
          name: `건물 ${index + 1}`,
          name_en: `Building ${index + 1}`,
        }));
  await page.addInitScript(
    (value) => localStorage.setItem("ku_favorites", value),
    JSON.stringify(favorites),
  );
}

/** "중앙"이 들어간 건물 열 개 — 결과가 여덟 개로 잘리고 목록이 길어진다 */
async function routeManyBuildings(page: Page) {
  const polygon = (dx: number) => ({
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
        features: Array.from({ length: 10 }, (_, index) => ({
          type: "Feature",
          geometry: polygon(index * 0.001),
          properties: {
            id: index + 1,
            name: `중앙건물 ${index + 1}`,
            name_en: `Central ${index + 1}`,
          },
        })),
      }),
    }),
  );
}

async function accessibleNames(buttons: Locator) {
  return buttons.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label") ?? ""),
  );
}

/** 마커·폴리곤·팝업이 아닌 지도 바닥을 누른다 */
async function clickEmptyMap(page: Page, x: number, y: number) {
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element?.closest(".leaflet-container")) return "지도 밖";
      if (
        element.closest(
          ".leaflet-interactive, .leaflet-marker-icon, .leaflet-popup",
        )
      )
        return "지도 위 요소";
      return "지도";
    },
    { x, y },
  );
  expect(hit, `(${x}, ${y})는 빈 지도여야 한다`).toBe("지도");
  await page.mouse.click(x, y);
}

async function expectTouchTarget(target: Locator, label: string) {
  const box = await target.boundingBox();
  expect(box, label).not.toBeNull();
  expect(box!.width, label).toBeGreaterThanOrEqual(44);
  expect(box!.height, label).toBeGreaterThanOrEqual(44);
}

test.describe("공개 지도 메뉴 — 웹 접기·펼치기", () => {
  test("접으면 왼쪽 줄만 남고 새로 고쳐도 접혀 있으며, 펼치면 돌아온다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await expect(page.locator(".ku-filter-panel")).toBeVisible();
    await expect(menuNav(page)).toHaveCount(0);

    await page.getByRole("button", { name: "메뉴 접기" }).click();
    await expect(menuNav(page)).toBeVisible();
    const names = await accessibleNames(menuNav(page).getByRole("button"));
    expect(names.map((name) => name.replace(/ \(\d+\)$/, ""))).toEqual([
      "메뉴 펼치기",
      "검색",
      "필터",
      "즐겨찾기",
      "목록",
    ]);
    await expect(menuButton(page, "메뉴 펼치기")).toBeFocused();
    await expect(page.locator(".ku-search-control")).toHaveCount(0);
    await expect(page.locator(".ku-filter-panel")).toHaveCount(0);
    await expect(page.locator(".ku-map-browse-trigger")).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ku_menu_collapsed")),
    ).toBe("true");

    await page.reload();
    await expect(menuButton(page, "메뉴 펼치기")).toBeVisible();
    await expect(page.locator(".ku-filter-panel")).toHaveCount(0);

    await menuButton(page, "메뉴 펼치기").click();
    await expect(page.locator(".ku-filter-panel")).toBeVisible();
    await expect(page.locator(".ku-map-browse-trigger")).toBeVisible();
    await expect(menuNav(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "메뉴 접기" })).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("ku_menu_collapsed")),
    ).toBe("false");
  });

  test("저장 값이 모르는 값이거나 읽다가 예외가 나면 펼친다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.addInitScript(() =>
      localStorage.setItem("ku_menu_collapsed", "yes"),
    );
    await page.goto("/");
    await expect(page.locator(".ku-filter-panel")).toBeVisible();
    await expect(menuNav(page)).toHaveCount(0);

    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === "ku_menu_collapsed")
          throw new DOMException("blocked", "SecurityError");
        return getItem.call(this, key);
      };
    });
    await page.reload();
    await expect(page.locator(".ku-filter-panel")).toBeVisible();
    await expect(menuNav(page)).toHaveCount(0);
  });
});

test.describe("공개 지도 메뉴 — 웹 접힌 줄", () => {
  test.beforeEach(async ({ page }) => {
    await seedCollapsed(page);
  });

  test("버튼마다 줄 오른쪽에 자기 패널 하나만 열고, 같은 버튼을 다시 누르면 닫는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    const rail = (await menuNav(page).boundingBox())!;

    for (const [name, id] of [
      ["검색", "map-search-panel"],
      ["필터", "map-filter-panel"],
      [/^즐겨찾기/, "map-favorites-panel"],
      [/^목록/, "map-browse-panel"],
    ] as const) {
      const button = menuButton(page, name);
      await expect(button).toHaveAttribute("aria-controls", id);
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#${id}`)).toBeVisible();
      await expect(page.locator(".ku-menu-panel")).toHaveCount(1);
      const panel = (await page.locator(".ku-menu-panel").boundingBox())!;
      expect(panel.x).toBeGreaterThanOrEqual(rail.x + rail.width);
      expect(Math.abs(panel.y - rail.y)).toBeLessThanOrEqual(1);
    }

    await menuButton(page, /^목록/).click();
    await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
    await expect(menuButton(page, /^목록/)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("열면 첫 조작에 초점이 가고, Esc는 초점이 어디 있든 패널만 닫고 버튼으로 돌린다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");

    await menuButton(page, "필터").click();
    await expect(
      page.getByRole("button", { name: /캠퍼스 영역/ }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
    await expect(menuButton(page, "필터")).toBeFocused();

    // 결과가 떠 있어도 한 번에 닫힌다 — 접힌 줄의 검색은 패널이다
    await menuButton(page, "검색").click();
    const input = page.getByPlaceholder("건물 검색...");
    await expect(input).toBeFocused();
    await input.fill("중앙");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
    await expect(menuButton(page, "검색")).toBeFocused();

    await menuButton(page, "필터").click();
    await page.locator(".leaflet-container").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
    await expect(menuButton(page, "필터")).toBeFocused();
  });

  test("필터를 바꿔도 열린 채이고, 지도를 끌면 남고 누르면 닫히며, 다시 열면 절 펼침이 남아 있다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");

    await menuButton(page, "필터").click();
    await page.getByRole("button", { name: "시설", exact: true }).click();
    await page.getByRole("button", { name: /경사로/ }).click();
    await expect(
      page.locator('[data-testid="facility-marker-f-installed"]'),
    ).toBeVisible();
    await expect(page.locator("#map-filter-panel")).toBeVisible();
    await expect(menuButton(page, "필터 (1)")).toBeVisible();

    await page.mouse.move(1000, 420);
    await page.mouse.down();
    await page.mouse.move(920, 380, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator("#map-filter-panel")).toBeVisible();

    await clickEmptyMap(page, 1150, 300);
    await expect(page.locator("#map-filter-panel")).toHaveCount(0);

    await menuButton(page, "필터 (1)").click();
    await expect(
      page.getByRole("button", { name: "시설", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("마커를 누르면 닫히고, 마커 팝업 안을 누르면 닫히지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");

    await menuButton(page, "필터").click();
    await page
      .locator('[data-testid^="landmark-marker-"]')
      .locator("..")
      .evaluate((marker: HTMLElement) => marker.click());
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expect(page.locator(".ku-menu-panel")).toHaveCount(0);

    await menuButton(page, "필터").click();
    await page.locator(".leaflet-popup-content").click();
    await expect(page.locator("#map-filter-panel")).toBeVisible();
  });

  test("검색·즐겨찾기·목록에서 고르면 닫고 그 자리로 가며 초점은 줄 버튼으로, 검색어는 남는다", async ({
    page,
  }) => {
    await seedFavorites(page);
    await installMockBackend(page);
    await page.goto("/");

    await menuButton(page, "검색").click();
    const input = page.getByPlaceholder("건물 검색...");
    await input.fill("다람쥐길");
    await page.locator('.ku-search-result[data-kind="landmark"]').click();
    await expect(page.locator("#map-search-panel")).toHaveCount(0);
    await expect(menuButton(page, "검색")).toBeFocused();
    await menuButton(page, "검색").click();
    await expect(input).toHaveValue("다람쥐길");

    await menuButton(page, /^즐겨찾기/).click();
    await page
      .locator("#map-favorites-panel")
      .getByText("중앙도서관", { exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "중앙도서관 접근성 정보" }),
    ).toBeVisible();
    await expect(page.locator("#map-favorites-panel")).toHaveCount(0);
    await expect(menuButton(page, /^즐겨찾기/)).toBeFocused();
    // 상세가 열려도 줄은 남는다(멘토링 설계 6.2)
    await expect(menuNav(page)).toBeVisible();

    await menuButton(page, /^목록/).click();
    await page.getByRole("button", { name: /다람쥐길.*지도 보기/ }).click();
    await expect(page.locator("#map-browse-panel")).toHaveCount(0);
    await expect(menuButton(page, /^목록/)).toBeFocused();
  });
});

test.describe("공개 지도 메뉴 — 웹 펼침", () => {
  test("즐겨찾기·목록·검색 결과는 한 번에 하나이고, 검색창의 첫 Esc는 결과만 닫는다", async ({
    page,
  }) => {
    await seedFavorites(page);
    await installMockBackend(page);
    await page.goto("/");

    await page.getByTitle("즐겨찾기").click();
    await expect(page.locator("#map-favorites-panel")).toBeVisible();
    await page.getByRole("button", { name: /현재 지도 목록/ }).click();
    await expect(page.locator("#map-browse-panel")).toBeVisible();
    await expect(page.locator("#map-favorites-panel")).toHaveCount(0);

    const input = page.getByPlaceholder("건물 검색...");
    await input.fill("중앙");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.locator("#map-browse-panel")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("중앙");
  });

  test("상세를 닫는 사이 같은 건물을 즐겨찾기에서 다시 고르면 상세가 남는다", async ({
    page,
  }) => {
    await seedFavorites(page);
    await installMockBackend(page);
    await page.goto("/");

    await page.getByTitle("즐겨찾기").click();
    await page
      .locator("#map-favorites-panel")
      .getByText("중앙도서관", { exact: true })
      .click();
    const panel = page.locator(".ku-side-panel");
    await expect(panel).toHaveAttribute("data-visible", "true");

    // 닫기 타이머(0.28초) 안에 다시 고르려고 한 번의 evaluate에서 누른다
    await page.evaluate(() => {
      const press = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.click();
      press(".ku-side-panel .ku-side-close");
      press(".ku-favorite-button");
      press("#map-favorites-panel .ku-favorite-row");
    });
    await page.waitForTimeout(400);
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute("data-visible", "true");
  });
});

test("접힌 줄에서 패널 안에 초점을 둔 채 모바일 폭으로 줄이면 패널이 닫히고 초점은 아래 줄의 같은 버튼으로 간다", async ({
  page,
}) => {
  await seedCollapsed(page);
  await installMockBackend(page);
  await page.goto("/");

  await menuButton(page, "필터").click();
  await expect(page.getByRole("button", { name: /캠퍼스 영역/ })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ku-menu-nav--bar")).toBeVisible();
  await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
  await expect(menuButton(page, "필터")).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".ku-menu-nav--rail")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("ku_menu_collapsed")),
  ).toBe("true");
});

test.describe("공개 지도 메뉴 — 모바일", () => {
  for (const size of PHONES) {
    test(`${size.width}×${size.height}: 아래 줄과 패널이 화면 안에 들고, 조작이 44px 이상이며, 지도 버튼·출처가 줄 위에 있다`, async ({
      page,
    }) => {
      await seedFavorites(page);
      await installMockBackend(page);
      await page.setViewportSize(size);
      await page.goto("/");

      const bar = page.locator(".ku-menu-nav--bar");
      // 이름은 기다리지 않고 한 번에 읽는다. 지도가 늦게 불려 오므로 줄이 그려진 뒤에 읽는다
      await expect(bar).toBeVisible();
      const buttons = bar.getByRole("button");
      const names = await accessibleNames(buttons);
      expect(names.map((name) => name.replace(/ \(\d+\)$/, ""))).toEqual([
        "검색",
        "필터",
        "즐겨찾기",
        "목록",
      ]);
      for (const button of await buttons.all()) {
        await expectTouchTarget(button, "줄 버튼");
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.5);
      }
      const barBox = (await bar.boundingBox())!;
      expect(
        Math.abs(barBox.y + barBox.height - size.height),
      ).toBeLessThanOrEqual(0.5);
      for (const selector of [".ku-attribution", ".ku-map-actions"]) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.y + box.height, selector).toBeLessThanOrEqual(barBox.y);
      }
      const language = page.locator(".ku-language-trigger");
      await expect(language).toBeVisible();
      const languageBox = (await language.boundingBox())!;
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(size.width);

      for (const name of ["필터", /^즐겨찾기/, /^목록/]) {
        await menuButton(page, name).click();
        const panel = page.locator(".ku-menu-panel");
        await expect(panel).toBeVisible();
        const box = (await panel.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(barBox.y);
        expect(box.y).toBeGreaterThanOrEqual(
          languageBox.y + languageBox.height,
        );
        // 패널이 열린 동안 지도 버튼 열은 숨는다
        await expect(
          page.getByRole("button", { name: "현 위치" }),
        ).toBeHidden();
        for (const control of await panel
          .locator("button, .ku-filter-check")
          .all())
          await expectTouchTarget(control, "패널 안 조작");
        await menuButton(page, name).click();
        await expect(panel).toHaveCount(0);
      }
    });
  }

  test.describe("390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("검색은 위쪽에 열려 바로 입력하고, 결과가 줄 위에서 끝나며, 닫기·Esc로 닫으면 초점이 줄로 돌아온다", async ({
      page,
    }) => {
      await installMockBackend(page);
      await routeManyBuildings(page);
      await page.goto("/");

      await menuButton(page, "검색").click();
      const input = page.getByPlaceholder("건물 검색...");
      await expect(input).toBeFocused();
      await input.fill("중앙");
      await expect(page.getByRole("option")).toHaveCount(8);
      const barBox = (await page.locator(".ku-menu-nav--bar").boundingBox())!;
      const panelBox = (await page.locator("#map-search-panel").boundingBox())!;
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(barBox.y);

      await expectTouchTarget(
        page.getByRole("button", { name: "검색어 지우기" }),
        "검색어 지우기",
      );

      await page.getByRole("button", { name: "검색 닫기" }).click();
      await expect(page.locator("#map-search-panel")).toHaveCount(0);
      await expect(menuButton(page, "검색")).toBeFocused();

      await menuButton(page, "검색").click();
      await expect(page.getByRole("option")).toHaveCount(8);
      await page.keyboard.press("Escape");
      await expect(page.locator("#map-search-panel")).toHaveCount(0);
      await expect(menuButton(page, "검색")).toBeFocused();
    });

    test("보이는 영역이 줄면(화상 키보드) 검색 패널이 그 안으로 줄어든다", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const viewport = Object.assign(new EventTarget(), {
          offsetTop: 0,
          offsetLeft: 0,
          pageTop: 0,
          pageLeft: 0,
          width: 390,
          height: 844,
          scale: 1,
        });
        Object.defineProperty(window, "visualViewport", {
          configurable: true,
          get: () => viewport,
        });
        (
          window as unknown as { setVisibleHeight: (height: number) => void }
        ).setVisibleHeight = (height) => {
          viewport.height = height;
          viewport.dispatchEvent(new Event("resize"));
        };
      });
      await installMockBackend(page);
      await routeManyBuildings(page);
      await page.goto("/");

      await menuButton(page, "검색").click();
      await page.getByPlaceholder("건물 검색...").fill("중앙");
      await expect(page.getByRole("option")).toHaveCount(8);

      await page.evaluate(() =>
        (
          window as unknown as { setVisibleHeight: (height: number) => void }
        ).setVisibleHeight(420),
      );
      const panel = page.locator("#map-search-panel");
      await expect
        .poll(async () => {
          const box = (await panel.boundingBox())!;
          return box.y + box.height;
        })
        .toBeLessThanOrEqual(420);
      expect(
        await page
          .locator(".ku-search-results")
          .evaluate((list) => list.scrollHeight > list.clientHeight),
      ).toBe(true);
    });

    test("아래 패널이 높아도 언어 목록을 열어 고를 수 있고, 언어 목록이 열린 동안 Esc는 그것만 닫는다", async ({
      page,
    }) => {
      await seedFavorites(page, 20);
      await installMockBackend(page);
      await page.goto("/");

      await menuButton(page, /^즐겨찾기/).click();
      const panel = page.locator(".ku-menu-panel");
      // 언어 목록이 펼쳐지는 높이까지 패널이 올라와 있어야 겹침을 본다
      expect((await panel.boundingBox())!.y).toBeLessThan(120);

      const language = page.locator(".ku-language-trigger");
      await language.click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("listbox", { name: "언어 선택" }),
      ).toHaveCount(0);
      await expect(page.locator("#map-favorites-panel")).toBeVisible();

      await language.click();
      await page
        .getByRole("listbox", { name: "언어 선택" })
        .getByRole("option", { name: "EN", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Map menu" }),
      ).toBeVisible();
      await expect(page.locator("#map-favorites-panel")).toBeVisible();
    });

    test("검색으로 건물을 고르면 패널이 닫히고 줄이 숨으며 초점이 상세로 가고, 상세를 닫으면 줄이 돌아온다", async ({
      page,
    }) => {
      await installMockBackend(page);
      await page.goto("/");

      await menuButton(page, "검색").click();
      await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
      await page.getByRole("option", { name: /중앙도서관/ }).click();
      const detail = page.getByRole("complementary", {
        name: "중앙도서관 접근성 정보",
      });
      await expect(detail).toBeFocused();
      await expect(page.locator("#map-search-panel")).toHaveCount(0);
      await expect(page.locator(".ku-menu-nav--bar")).toHaveCount(0);

      await page.locator(".ku-side-handle").click();
      await expect(page.locator(".ku-side-panel")).toHaveCount(0);
      await expect(page.locator(".ku-menu-nav--bar")).toBeVisible();
    });

    test("지도를 누르면 아래 패널이 닫힌다", async ({ page }) => {
      await installMockBackend(page);
      await page.goto("/");

      await menuButton(page, "필터").click();
      await expect(page.locator("#map-filter-panel")).toBeVisible();
      const panel = (await page.locator(".ku-menu-panel").boundingBox())!;
      await clickEmptyMap(page, 60, Math.round(panel.y - 40));
      await expect(page.locator(".ku-menu-panel")).toHaveCount(0);
    });
  });
});
