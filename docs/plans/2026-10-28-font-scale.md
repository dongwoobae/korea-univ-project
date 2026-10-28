# 글자 크기(PR ⑥) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 지도 글자를 오른쪽 아래 `가−`·`가＋` 두 버튼으로 작게(0.9)·보통·크게(1.2) 세 단계로 바꾸고(`ku_font_scale`), 관리자
화면 글자는 그대로 둔다.

**Architecture:** 기준은 `<html data-font-scale="small|large">` 속성이다(보통이면 없음). `<head>` 인라인 스크립트가 첫 그리기 전에
저장 값을 걸고, 클라이언트 모듈 저장소(`useSyncExternalStore`)가 속성을 읽고 바꾼다. 배율은 CSS 변수 `--ku-fs` 하나로, 공개 화면
뿌리(`.ku-font-scope`)에만 값을 건다. 커질 글자는 `calc(Npx * var(--ku-fs, 1))`로 써서 변수가 없는 관리자 화면에서는 1배로 풀린다.

**Tech Stack:** Next 16.2.4(App Router), React 19.2.4(React Compiler), react-leaflet 5, Leaflet 1.9.4, vitest(node 환경),
Playwright(목 백엔드 `e2e/support/mockBackend.ts`, `next dev`).

**Spec:** `docs/specs/2026-10-28-font-scale-design.md`(세부), `docs/specs/2026-10-25-mentoring-feedback-design.md` 8장(요구·사용자 결정).
상태 틀은 `docs/specs/2026-10-28-dark-mode-design.md` 2장과 같다.

## Global Constraints

- 저장 키 `ku_font_scale`. 정확히 `"small"`·`"large"`일 때만 그 단계, 없음·`"normal"`·모르는 값·예외는 보통. 쓰기 실패는 화면만
  바꾼다. 보통으로 돌아오면 `"normal"`을 쓴다.
- 배율: 작게 0.9 · 보통 1 · 크게 1.2. 값을 바꾸면 세부 설계 2.3·멘토링 설계 8.1·시험을 함께 바꾼다.
- 그대로인 글자(설계 2.2): 메뉴 줄 이름·배지, 지도 버튼 열 이름, 언어 버튼, `가−`·`가＋` 글자, 마커·묶음 숫자, 아이콘·이모지, 사진
  넘김 화살표, 검색 지우기 `×`, 사진 칸 지우기 `×`, 출처 표기, 경사도 범례 눈금 숫자.
- 관리자 화면 글자는 어떤 경우에도 바뀌지 않는다. 공용 컴포넌트(`FacilityFields`·`.ku-toast`·`.bldg-label`·범례 툴팁)는
  `var(--ku-fs, 1)`이라 관리자 쪽에서 1배다.
- 버튼 이름: ko "글자 작게"·"글자 크게"(묶음 "글자 크기"), en "Smaller text"·"Larger text"("Text size"), zh "缩小字号"·"放大字号"
  ("字号"). 보이는 글자 ko `가−`·`가＋`, en `A−`·`A＋`, zh `字−`·`字＋`(`−`는 U+2212, `＋`는 U+FF0B). 끝 단계는 `aria-disabled`
  (`disabled` 아님).
- 터치 대상: 웹 44px, 모바일 48px(`.ku-map-action`). 폭 경계 768px(`@media (max-width: 767px)`, `isMobile = innerWidth < 768`).
- 커밋·주석·문서에 날짜만 적고 과정 이름을 적지 않는다. `Co-Authored-By` 없음.
- 로컬에서 npm ci·vitest·tsc·eslint·Playwright를 돌리지 않는다 — PR CI로 본다. `gh workflow run` 금지. 포맷은 push 전에
  `npx --yes prettier@3.9.4 --write <파일>`.

---

### Task 1: 설계와 진행 상황 (끝남)

- [x] 세부 설계 `docs/specs/2026-10-28-font-scale-design.md`, 멘토링 설계 진행 상황(⑤ 완료·⑥ 진행 중)·1장 표·8.1 — `2eaf479`,
      `d9a7734`. 이 계획과 같은 커밋에서 진행 상황 "다음에 할 일"에 계획 경로를 더한다.

### Task 2: 시험 먼저 (push → draft PR)

**Files:**

- Create: `src/lib/fontScale.test.ts`, `e2e/font-scale.spec.ts`
- Modify: `e2e/support/mockBackend.ts`, `e2e/theme.spec.ts`, `e2e/public-map.spec.ts`

**Interfaces (Task 3~6이 만든다):**

- `src/lib/fontScale.ts`: `type FontScale = "small" | "normal" | "large"`, `FONT_SCALES: readonly FontScale[]`(작은 것부터),
  `FONT_SCALE_STORAGE_KEY = "ku_font_scale"`, `parseStoredFontScale(value: string | null): FontScale`,
  `scaledFontSize(px: number): string`, `FONT_SCALE_INIT_SCRIPT: string`.
- `src/lib/useFontScale.ts`(`"use client"`): `setFontScale(scale: FontScale): void`, `subscribeFontScale(listener: () => void): () => void`,
  `useFontScale(): FontScale`.
- DOM 계약: `role="group"`(이름 "글자 크기") 안에 버튼 두 개와 `aria-live="polite"` 숨김 글. 묶음 클래스 `ku-font-scale`. 묶음은
  `.ku-map-actions` 안 — 웹은 피드백 바로 앞, 모바일은 맨 앞. 공개 뿌리 클래스 `ku-font-scope`.

- [ ] **Step 1: `src/lib/fontScale.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FONT_SCALE_INIT_SCRIPT,
  FONT_SCALES,
  parseStoredFontScale,
  scaledFontSize,
} from "./fontScale";
import { setFontScale, subscribeFontScale } from "./useFontScale";

function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  };
}

function runInitScript(getItem: (key: string) => string | null) {
  const root = fakeRoot();
  new Function("localStorage", "document", FONT_SCALE_INIT_SCRIPT)(
    { getItem },
    { documentElement: root },
  );
  return root.attributes.get("data-font-scale") ?? null;
}

describe("parseStoredFontScale", () => {
  it("정확히 small·large일 때만 그 단계다", () => {
    expect(parseStoredFontScale("small")).toBe("small");
    expect(parseStoredFontScale("large")).toBe("large");
    for (const value of ["normal", null, "LARGE", "1.2", ""])
      expect(parseStoredFontScale(value)).toBe("normal");
  });
});

describe("FONT_SCALES", () => {
  it("작은 것부터 세 단계다", () => {
    expect(FONT_SCALES).toEqual(["small", "normal", "large"]);
  });
});

describe("scaledFontSize", () => {
  it("배율 변수가 없으면 1배로 풀리는 calc를 만든다", () => {
    expect(scaledFontSize(13)).toBe("calc(13px * var(--ku-fs, 1))");
    expect(scaledFontSize(10.5)).toBe("calc(10.5px * var(--ku-fs, 1))");
  });
});

describe("FONT_SCALE_INIT_SCRIPT", () => {
  it("저장 값이 small·large면 html에 data-font-scale을 건다", () => {
    for (const value of ["small", "large"])
      expect(
        runInitScript((key) => (key === "ku_font_scale" ? value : null)),
      ).toBe(value);
  });

  it("그 밖의 값이면 걸지 않는다", () => {
    for (const value of ["normal", null, "LARGE"])
      expect(runInitScript(() => value)).toBeNull();
  });

  it("저장소가 예외를 던져도 밖으로 내지 않고 보통으로 둔다", () => {
    expect(
      runInitScript(() => {
        throw new Error("blocked");
      }),
    ).toBeNull();
  });
});

describe("setFontScale", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(setItem: (key: string, value: string) => void) {
    const root = fakeRoot();
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("localStorage", { setItem });
    return root;
  }

  it("속성과 저장 값을 바꾸고 구독자를 부른다", () => {
    const stored = new Map<string, string>();
    const root = stub((key, value) => stored.set(key, value));
    const listener = vi.fn();
    const unsubscribe = subscribeFontScale(listener);

    setFontScale("large");
    expect(root.getAttribute("data-font-scale")).toBe("large");
    expect(stored.get("ku_font_scale")).toBe("large");
    expect(listener).toHaveBeenCalledTimes(1);

    setFontScale("normal");
    expect(root.getAttribute("data-font-scale")).toBeNull();
    expect(stored.get("ku_font_scale")).toBe("normal");

    unsubscribe();
    setFontScale("small");
    expect(root.getAttribute("data-font-scale")).toBe("small");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("저장이 실패해도 화면은 바뀌고 예외를 내지 않는다", () => {
    const root = stub(() => {
      throw new Error("blocked");
    });
    expect(() => setFontScale("large")).not.toThrow();
    expect(root.getAttribute("data-font-scale")).toBe("large");
  });
});
```

- [ ] **Step 2: `e2e/support/mockBackend.ts`에 `fontScale` 옵션**

옵션 타입의 `theme?: "dark";` 다음에:

```ts
    /** 저장 값이 없으면 `ku_font_scale`를 이 값으로 둔다(docs/specs/2026-10-28-font-scale-design.md 5.3) */
    fontScale?: "small" | "large";
```

`addInitScript` 콜백의 구조 분해에 `fontScale,`을 더하고, `ku_theme` 줄 다음에:

```ts
if (fontScale && localStorage.getItem("ku_font_scale") === null)
  localStorage.setItem("ku_font_scale", fontScale);
```

인자 객체의 `theme: options.theme ?? null,` 다음에 `fontScale: options.fontScale ?? null,`.

- [ ] **Step 3: `e2e/font-scale.spec.ts`**

```ts
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
      await smaller(page).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-font-scale",
        "small",
      );
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
    for (const name of [/^검색/, /^필터/, /^즐겨찾기/, /^목록/]) {
      await nav.getByRole("button", { name }).click();
      await expect(panel).toBeVisible();
      await expectNoHorizontalOverflow(String(name), panel);
      if (String(name) === String(/^필터/)) {
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
    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
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
    for (const ticks of rows)
      for (let i = 1; i < ticks.length; i++)
        expect(ticks[i - 1][1]).toBeLessThanOrEqual(ticks[i][0]);
  }
});
```

- [ ] **Step 4: 기존 E2E 고치기** — 설계 5.3.
  - `e2e/theme.spec.ts` "펼친 모습은 지도 버튼 열의 위성 다음에 토글이 하나 있다":

```ts
expect(labels.slice(-5)).toEqual([
  "위성 지도로 전환",
  "다크모드",
  "글자 작게",
  "글자 크게",
  "피드백 보내기",
]);
```

- `e2e/public-map.spec.ts` "필터를 닫아도 남고, 탭으로 툴팁을 열고 닫으며, 출처와 버튼 열을 비키고 건물을 열면 숨는다": `const actionsBox = …`
  줄과 `expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(actionsBox.x);`를 지우고, 출처 단언 다음에:

```ts
// 모바일 열 맨 위의 글자 크기 줄이 열 상자를 왼쪽으로 넓힌다. 범례와 높이가 겹치는 버튼만 본다(docs/specs/2026-10-28-font-scale-design.md 1.2)
const besideLegend = await page.locator(".ku-map-actions button").evaluateAll(
  (buttons, legend) =>
    buttons
      .map((button) => button.getBoundingClientRect())
      .filter(
        (box) =>
          box.width > 0 &&
          box.bottom > legend.y &&
          box.top < legend.y + legend.height,
      )
      .map((box) => box.left),
  legendBox,
);
expect(besideLegend.length).toBeGreaterThan(0);
for (const left of besideLegend)
  expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(left);
```

- [ ] **Step 5: 포맷·커밋·push·draft PR**

```bash
npx --yes prettier@3.9.4 --write src/lib/fontScale.test.ts e2e/font-scale.spec.ts e2e/support/mockBackend.ts e2e/theme.spec.ts e2e/public-map.spec.ts
git add src/lib/fontScale.test.ts e2e/font-scale.spec.ts e2e/support/mockBackend.ts e2e/theme.spec.ts e2e/public-map.spec.ts
git commit -m "test: 글자 크기 버튼·배율·첫 그리기·관리자 불변·넘침 시험을 먼저 두고 바뀌는 기존 시험을 고친다"
git push -u origin feat/font-scale
gh pr create --draft --title "feat: 글자 크기 조절(멘토링 ⑥)" --body "구현 전 시험만 올린 상태. 본문은 구현 뒤 채운다."
```

기대: Typecheck·vitest는 `./fontScale`·`./useFontScale`이 없어 실패. Playwright는 `font-scale.spec.ts`와 고친 `theme.spec.ts` 시험이
실패하고 나머지는 통과(`public-map.spec.ts` 범례 시험은 고친 뒤에도 지금 화면에서 맞다). 실패 목록을 PR 본문 "시험"에 남긴다.

### Task 3: 상태와 첫 그리기

**Files:**

- Create: `src/lib/fontScale.ts`, `src/lib/useFontScale.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: `src/lib/fontScale.ts`**

```ts
// 서버 컴포넌트(루트 레이아웃)가 가져간다 — React를 가져오지 않는다. 훅은 useFontScale.ts(docs/specs/2026-10-28-font-scale-design.md 3.1)

export type FontScale = "small" | "normal" | "large";

export const FONT_SCALES: readonly FontScale[] = ["small", "normal", "large"];

export const FONT_SCALE_STORAGE_KEY = "ku_font_scale";

export function parseStoredFontScale(value: string | null): FontScale {
  return value === "small" || value === "large" ? value : "normal";
}

/** 공개 화면 글자 크기. --ku-fs가 없는 관리자 화면에서는 px 그대로다(설계 3.3) */
export function scaledFontSize(px: number) {
  return `calc(${px}px * var(--ku-fs, 1))`;
}

/** <head>에서 첫 그리기 전에 돈다. ES5만 쓴다. 다크 모드 스크립트 뒤에 이어 붙어 전역 변수를 남기지 않게 감싼다 */
export const FONT_SCALE_INIT_SCRIPT = `;(function(){try{var s=localStorage.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)});if(s==="small"||s==="large")document.documentElement.setAttribute("data-font-scale",s)}catch(e){}})();`;
```

- [ ] **Step 2: `src/lib/useFontScale.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";
import {
  FONT_SCALE_STORAGE_KEY,
  parseStoredFontScale,
  type FontScale,
} from "./fontScale";

const listeners = new Set<() => void>();

function readFontScale(): FontScale {
  return parseStoredFontScale(
    document.documentElement.getAttribute("data-font-scale"),
  );
}

export function subscribeFontScale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setFontScale(scale: FontScale) {
  const root = document.documentElement;
  if (scale === "normal") root.removeAttribute("data-font-scale");
  else root.setAttribute("data-font-scale", scale);
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
  } catch {
    // 저장이 막힌 환경 — 화면만 바꾼다
  }
  for (const listener of listeners) listener();
}

/** 서버와 hydration 동안은 보통, 그 뒤로는 <html>의 실제 값 */
export function useFontScale(): FontScale {
  return useSyncExternalStore(
    subscribeFontScale,
    readFontScale,
    () => "normal",
  );
}
```

- [ ] **Step 3: `src/app/layout.tsx`** — `import { FONT_SCALE_INIT_SCRIPT } from "@/lib/fontScale";`를 더하고, `<head>` 첫 스크립트를

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: COLOR_MODE_INIT_SCRIPT + FONT_SCALE_INIT_SCRIPT,
  }}
/>
```

로 바꾼다.

- [ ] **Step 4: 커밋** — `feat: 글자 크기 단계를 html 속성으로 두고 첫 그리기 전에 저장 값을 건다`.

### Task 4: 배율을 거는 자리(CSS·공개 뿌리)

**Files:**

- Modify: `src/components/map/map-ui.css`, `src/components/map/slope-bands-legend.css`, `src/app/globals.css`,
  `src/components/map/Map.tsx`(셸 클래스만), `src/components/map/FeedbackButton.tsx`,
  `src/components/sidepanel/FacilityRequestModal.tsx`, `src/components/sidepanel/PhotoLightbox.tsx`

- [ ] **Step 1: `map-ui.css`의 px 글자를 한꺼번에 calc로 바꾼다**

```bash
sed -i -E 's/font-size: ([0-9.]+px);/font-size: calc(\1 * var(--ku-fs, 1));/' src/components/map/map-ui.css
```

- [ ] **Step 2: 그대로인 글자(설계 2.2)를 px로 되돌린다** — 아래 선택자의 `font-size`를 원래 값으로 고친다(Edit).

  | 선택자                                        | 값       |
  | --------------------------------------------- | -------- |
  | `.ku-favorite-badge`                          | `11px`   |
  | `.ku-search-clear`                            | `18px`   |
  | `.ku-language-inline button`                  | `12px`   |
  | `.ku-map-action-label`                        | `10.5px` |
  | `.ku-marker-cluster strong`                   | `13px`   |
  | `.ku-menu-button`                             | `11px`   |
  | `.ku-menu-badge`                              | `11px`   |
  | `.ku-attribution`(웹)                         | `12px`   |
  | `.ku-request-photo-slot button`               | `11px`   |
  | 모바일 `.ku-menu-nav--bar .ku-menu-button`    | `12px`   |
  | 모바일 `.ku-language-trigger`                 | `14px`   |
  | 모바일 `.ku-language-listbox [role="option"]` | `14px`   |
  | 모바일 `.ku-attribution`                      | `10px`   |

  모바일 `.ku-search-input`은 `font-size: max(16px, calc(16px * var(--ku-fs, 1)));`로 하고 바로 위에 주석
  `/* 16px보다 작으면 iOS Safari가 초점 때 화면을 확대한다(docs/specs/2026-10-28-font-scale-design.md 2.3) */`.

  확인: `grep -nE "font-size: [0-9.]+px" src/components/map/map-ui.css`의 결과가 위 표의 열세 줄뿐이다.

- [ ] **Step 3: 배율 변수와 뿌리 규칙** — `map-ui.css`의 `.ku-map-shell { … }` 규칙 바로 다음에:

```css
/* 값은 공개 화면 뿌리에만 건다. 관리자 화면에는 변수가 없어 calc가 1배로 풀린다(docs/specs/2026-10-28-font-scale-design.md 3.3) */
:root[data-font-scale="small"] .ku-font-scope {
  --ku-fs: 0.9;
}
:root[data-font-scale="large"] .ku-font-scope {
  --ku-fs: 1.2;
}
.ku-font-scope {
  font-size: calc(16px * var(--ku-fs, 1));
}
/* leaflet.css의 컨테이너 크기는 rem이라 뿌리를 따르지 않는다. .leaflet-tooltip에는 걸지 않는다 — .ku-building-label을 이긴다 */
.ku-font-scope .leaflet-container {
  font-size: calc(12px * var(--ku-fs, 1));
}
```

- [ ] **Step 4: 다른 CSS**
  - `slope-bands-legend.css` `.ku-slope-bands-tooltip`: `font-size: calc(12px * var(--ku-fs, 1));`. `.ku-slope-bands`의 `10px`(눈금)는 그대로.
  - `globals.css` `.leaflet-tooltip.bldg-label`: `font-size: calc(12px * var(--ku-fs, 1));`, `.ku-toast`: `font-size: calc(15px * var(--ku-fs, 1));`.

- [ ] **Step 5: 뿌리에 클래스**
  - `Map.tsx`: `className="ku-map-shell"` → `className="ku-map-shell ku-font-scope"`.
  - `FeedbackButton.tsx`: `className="ku-feedback-backdrop"` → `className="ku-feedback-backdrop ku-font-scope"`.
  - `FacilityRequestModal.tsx`: `className="ku-request-modal-backdrop"` → `className="ku-request-modal-backdrop ku-font-scope"`.
  - `PhotoLightbox.tsx`: `className="ku-photo-lightbox-backdrop"` → `className="ku-photo-lightbox-backdrop ku-font-scope"`.

- [ ] **Step 6: 커밋** — `feat: 공개 화면 뿌리에만 글자 배율 변수를 걸고 공개 CSS 글자를 배율로 쓴다`.

### Task 5: 인라인 글자와 지도 위 이름

**Files:**

- Modify: `src/components/map/FacilityMarkers.tsx`, `src/components/map/LandmarkMarkers.tsx`, `src/components/map/SubwayMarkers.tsx`,
  `src/components/map/SlopeLayer.tsx`, `src/components/map/MapErrorBanner.tsx`, `src/components/sidepanel/FacilityList.tsx`,
  `src/components/sidepanel/PhotoCarousel.tsx`, `src/components/facility/FacilityFields.tsx`, `src/components/map/Map.tsx`

**Interfaces:** Consumes `scaledFontSize`(Task 3), `useFontScale`(Task 3).

- [ ] **Step 1: 인라인 `fontSize: N` → `fontSize: scaledFontSize(N)`** — 각 파일에 `import { scaledFontSize } from "@/lib/fontScale";`.
  - `FacilityMarkers.tsx` 팝업: 13·12·12·11 네 곳.
  - `LandmarkMarkers.tsx` 팝업: 14·12. 마커 HTML의 이름표 `font:700 10.5px Pretendard,sans-serif` →
    `font:700 ${scaledFontSize(10.5)} Pretendard,sans-serif`. 이모지 `font-size:15px`와 `LandmarkEmoji size`는 그대로.
  - `SubwayMarkers.tsx` 이름표: `font-size:11px` → `font-size:${scaledFontSize(11)}`.
  - `SlopeLayer.tsx` 팝업: 13·11.
  - `MapErrorBanner.tsx`: 14·13.
  - `FacilityList.tsx` 다시 시도 버튼: 14.
  - `PhotoCarousel.tsx`: 사진 없음 13, 설명 12. 넘김 화살표 두 곳(14)은 그대로.
  - `FacilityFields.tsx`: `inputStyle` 13, `labelStyle` 12.
  - 확인: `grep -rnE "fontSize: [0-9]" src/components/map src/components/sidepanel src/components/facility`에 남는 것이 `PhotoCarousel` 화살표
    두 곳뿐이다(`iconography.tsx`의 `fontSize: size`는 아이콘).

- [ ] **Step 2: `Map.tsx` — 배율이 바뀌면 열린 툴팁·팝업을 다시 잰다** — `import { useFontScale } from "@/lib/useFontScale";`, `darkMode`
      줄 다음에 `const fontScale = useFontScale();`, `[lang]` 효과 다음에:

```tsx
// 툴팁·팝업은 열 때 잰 크기로 자리를 잡는다(docs/specs/2026-10-28-font-scale-design.md 4장)
useEffect(() => {
  mapRef.current?.eachLayer((layer) => {
    if (layer instanceof L.Tooltip || layer instanceof L.Popup) layer.update();
  });
}, [fontScale]);
```

- [ ] **Step 3: 커밋** — `feat: 공개 인라인 글자와 지도 위 이름을 배율로 쓰고 배율이 바뀌면 열린 툴팁·팝업을 다시 잰다`.

### Task 6: 버튼

**Files:**

- Create: `src/components/map/FontScaleControl.tsx`
- Modify: `src/lib/translations.ts`, `src/components/map/map-ui.css`, `src/components/map/Map.tsx`

**Interfaces:** Consumes `FONT_SCALES`·`FontScale`(Task 3), `setFontScale`·`useFontScale`(Task 3).

- [ ] **Step 1: 번역** — 세 언어 각각 `themeToLightLabel` 줄 다음에 더한다.

| 키                      | ko              | en                | zh         |
| ----------------------- | --------------- | ----------------- | ---------- |
| `fontScale`             | 글자 크기       | Text size         | 字号       |
| `fontScaleDown`         | 글자 작게       | Smaller text      | 缩小字号   |
| `fontScaleUp`           | 글자 크게       | Larger text       | 放大字号   |
| `fontScaleDownGlyph`    | 가−             | A−                | 字−        |
| `fontScaleUpGlyph`      | 가＋            | A＋               | 字＋       |
| `fontScaleStatusSmall`  | 글자 크기: 작게 | Text size: Small  | 字号：小   |
| `fontScaleStatusNormal` | 글자 크기: 보통 | Text size: Normal | 字号：标准 |
| `fontScaleStatusLarge`  | 글자 크기: 크게 | Text size: Large  | 字号：大   |

`−`는 U+2212, `＋`는 U+FF0B, 중국어 콜론은 U+FF1A다.

- [ ] **Step 2: `src/components/map/FontScaleControl.tsx`**

```tsx
"use client";

import { useId } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { FONT_SCALES, type FontScale } from "@/lib/fontScale";
import { setFontScale, useFontScale } from "@/lib/useFontScale";

const STATUS_KEY: Record<FontScale, string> = {
  small: "fontScaleStatusSmall",
  normal: "fontScaleStatusNormal",
  large: "fontScaleStatusLarge",
};

const STEPS = [
  {
    delta: -1,
    nameKey: "fontScaleDown",
    glyphKey: "fontScaleDownGlyph",
    modifier: "smaller",
  },
  {
    delta: 1,
    nameKey: "fontScaleUp",
    glyphKey: "fontScaleUpGlyph",
    modifier: "larger",
  },
] as const;

/** 지도 버튼 열의 글자 크기 두 버튼(docs/specs/2026-10-28-font-scale-design.md 1장) */
export default function FontScaleControl() {
  const { t } = useLanguage();
  const scale = useFontScale();
  const statusId = useId();
  const index = FONT_SCALES.indexOf(scale);

  return (
    <div className="ku-font-scale" role="group" aria-label={t("fontScale")}>
      {STEPS.map(({ delta, nameKey, glyphKey, modifier }) => {
        const next = FONT_SCALES[index + delta];
        return (
          <button
            key={modifier}
            className={`ku-map-action ku-font-scale-button ku-font-scale-button--${modifier}`}
            type="button"
            aria-label={t(nameKey)}
            title={t(nameKey)}
            aria-describedby={statusId}
            // disabled면 끝 단계에 닿는 순간 초점을 잃는다(설계 1.1)
            aria-disabled={next ? undefined : true}
            onClick={() => {
              if (next) setFontScale(next);
            }}
          >
            {t(glyphKey)}
          </button>
        );
      })}
      <span id={statusId} className="ku-visually-hidden" aria-live="polite">
        {t(STATUS_KEY[scale])}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: `map-ui.css`** — `.ku-map-action[data-locating="true"] svg { … }` 규칙 다음에:

```css
.ku-font-scale {
  display: flex;
  gap: 6px;
}
/* 버튼 글자는 아이콘처럼 배율을 따르지 않는다(docs/specs/2026-10-28-font-scale-design.md 2.2) */
.ku-font-scale-button {
  font-weight: 700;
  line-height: 1;
}
.ku-font-scale-button--smaller {
  font-size: 14px;
}
.ku-font-scale-button--larger {
  font-size: 18px;
}
.ku-font-scale-button[aria-disabled="true"] {
  cursor: default;
  opacity: 0.4;
}
```

확인: `grep -nE "font-size: [0-9.]+px" src/components/map/map-ui.css`가 Task 4 표의 열세 줄과 이 두 줄이다.

- [ ] **Step 4: `Map.tsx` 자리** — `import FontScaleControl from "./FontScaleControl";`. `.ku-map-actions` 안을 이렇게 한다(사이 버튼은 그대로):

```tsx
<div className="ku-map-actions">
  {/* 모바일은 열 맨 위 — 아래쪽은 경사도 범례와 높이가 겹친다(docs/specs/2026-10-28-font-scale-design.md 1.2) */}
  {isMobile && <FontScaleControl />}
  <div className="ku-map-zoom" aria-label="지도 확대 및 축소">
    {/* 그대로 */}
  </div>
  {/* 현 위치·위성 버튼, 펼침의 ThemeToggleButton 그대로 */}
  {!isMobile && <FontScaleControl />}
  <FeedbackButton />
</div>
```

- [ ] **Step 5: 커밋** — `feat: 오른쪽 아래 지도 버튼 열에 글자 크기 가−·가＋ 버튼을 둔다`.

### Task 7: push·CI·마무리

- [ ] **Step 1:** 바꾼 파일을 `npx --yes prettier@3.9.4 --write`로 맞추고 push. `gh pr checks <PR> --watch`.
- [ ] **Step 2: 실패 처리**
  - "넘침" 시험이 잡은 자리는 그 상자의 박힌 `height`를 `min-height`로 바꾸거나 줄바꿈을 허락해 고친다. 고친 자리를 PR 본문에 적는다.
    배율을 낮추지 않는다(설계 2.3).
  - "1.2배" 시험에서 한 자리만 1배로 남으면 그 글자가 px로 남은 곳(인라인·다른 CSS 파일)을 찾아 `calc`로 바꾼다. 그 글자가 2.2의
    그대로인 글자여야 한다면 설계 2.2에 더하고 시험 대상을 바꾼다.
  - "앱 JS 없이" 시험에서 `data-theme`만 걸리고 `data-font-scale`이 없으면 두 스크립트를 이어 붙인 문자열(Task 3 Step 3)을 본다.
  - `admin-landmarks-workspace.spec.ts` 모바일 위치 고르기 실패는 알려진 흔들림(멘토링 설계 진행 상황) — 실패 잡만 재실행한다.
- [ ] **Step 3: 참조 역추적** — 아래 결과를 PR 본문에 싣는다.

```bash
rg -n "ku_font_scale|data-font-scale|--ku-fs|ku-font-scope" src e2e docs
rg -n "버튼 자리는 ⑥에서|보기 패널에 더하기" docs
rg -nE "font-size: [0-9.]+px" src/components/map/map-ui.css src/components/map/slope-bands-legend.css
```

- [ ] **Step 4: PR 본문** — 요약, 바뀐 것, 정한 것(설계 근거), 시험(시험만 올린 run의 실패 목록과 최종 run 수치), 참조 역추적, 사용자
      확인 항목(실제 휴대폰에서 버튼 크기·자리, 크게에서 상세 시트 읽기). 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 5:** CI 통과 뒤 ready·병합은 사용자 지시를 기다린다. 병합 직전에 이 계획 문서를 `git rm`하고, 멘토링 설계 진행 상황 절
      "다음에 할 일"에서 이 계획 경로를 지운다(같은 커밋).
