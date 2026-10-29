import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-29-map-buttons-feedback-design.md

const NARROW = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
];

const LABELED = {
  ko: ["글자 크기", "현 위치", "위성", "경사도", "피드백"],
  en: ["Text size", "Location", "Satellite", "Slope", "Feedback"],
  zh: ["字号", "我的位置", "卫星", "坡度", "反馈"],
} as const;

/** 로딩 막을 기다리는 까닭은 e2e/font-scale.spec.ts의 openMap */
async function openMap(page: Page) {
  await page.goto("/");
  await expect(page.locator(".ku-font-scale")).toBeVisible();
  await expect(page.locator(".ku-map-loading")).toHaveCount(0);
}

async function setSlope(page: Page, on: boolean) {
  const button = page
    .locator(".ku-map-actions")
    .getByRole("button", { name: "경사도", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", String(!on));
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(on));
}

function labeledBoxes(page: Page) {
  return page
    .locator(".ku-map-actions .ku-map-action--labeled")
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => {
          const label = button.querySelector(".ku-map-action-label");
          const outer = button.getBoundingClientRect();
          const inner = label?.getBoundingClientRect();
          return {
            text: label?.textContent ?? "",
            labelShown: Boolean(inner && inner.width > 0 && inner.height > 0),
            button: {
              left: outer.left,
              right: outer.right,
              top: outer.top,
              bottom: outer.bottom,
            },
            label: inner && {
              left: inner.left,
              right: inner.right,
              top: inner.top,
              bottom: inner.bottom,
            },
            // 글자가 칸보다 길면 줄바꿈이 없어 넘친다
            overflowing: label ? label.scrollWidth > label.clientWidth : true,
          };
        }),
    );
}

function overlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

test.describe("좁은 화면 지도 버튼 이름(설계 1장)", () => {
  for (const viewport of NARROW) {
    const size = `${viewport.width}×${viewport.height}`;
    for (const [lang, names] of Object.entries(LABELED)) {
      test(`${size} ${lang}: 아이콘 아래 이름이 보이고 버튼 칸 안에 들어간다`, async ({
        page,
      }) => {
        await page.addInitScript(
          (code) => localStorage.setItem("ku_map_lang", code),
          lang,
        );
        await installMockBackend(page);
        await page.setViewportSize(viewport);
        await openMap(page);
        await expect(
          page.locator(".ku-map-actions .ku-map-action-label").first(),
        ).toHaveText(names[0]);

        const boxes = await labeledBoxes(page);
        expect(boxes.map((box) => box.text)).toEqual(names);
        for (const box of boxes) {
          expect(box.labelShown, box.text).toBe(true);
          expect(box.overflowing, box.text).toBe(false);
          expect(box.label!.left, box.text).toBeGreaterThanOrEqual(
            box.button.left,
          );
          expect(box.label!.right, box.text).toBeLessThanOrEqual(
            box.button.right,
          );
          expect(
            box.button.right - box.button.left,
            box.text,
          ).toBeGreaterThanOrEqual(48);
          expect(
            box.button.bottom - box.button.top,
            box.text,
          ).toBeGreaterThanOrEqual(48);
        }
        // 열의 버튼 폭이 같아야 범례가 열 왼쪽 한 자리에 맞출 수 있다
        const widths = new Set(
          boxes.map((box) => Math.round(box.button.right - box.button.left)),
        );
        expect([...widths]).toHaveLength(1);
      });
    }

    test(`${size}: 경사도 범례가 지도 버튼을 덮지 않는다`, async ({ page }) => {
      await installMockBackend(page);
      await page.setViewportSize(viewport);
      await openMap(page);
      await setSlope(page, true);
      const legend = page.locator(".ku-slope-legend");
      await expect(legend).toBeVisible();
      const legendBox = await legend.evaluate((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      });
      const buttons = await page
        .locator(".ku-map-actions button")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => {
              const { left, right, top, bottom } =
                element.getBoundingClientRect();
              return {
                name: element.getAttribute("aria-label"),
                box: { left, right, top, bottom },
              };
            }),
        );
      for (const { name, box } of buttons) {
        expect(overlaps(legendBox, box), name ?? "").toBe(false);
      }
    });
  }
});

test.describe("경사도 버튼 아이콘(설계 2장)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}×${viewport.height}: 산 모양이 아니라 밑선 없는 꺾은선이다`, async ({
      page,
    }) => {
      await installMockBackend(page);
      await page.setViewportSize(viewport);
      await openMap(page);
      const icon = page
        .locator(".ku-map-actions")
        .getByRole("button", { name: "경사도", exact: true })
        .locator("svg");
      await expect(icon).toHaveClass(/\blucide-slope-line\b/);
      await expect(icon).not.toHaveClass(/\blucide-mountain\b/);
    });
  }
});

test.describe("건물 이름이 보이는 확대(설계 3장)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}×${viewport.height}: 처음(16)에는 숨고 한 번 확대(17)하면 보인다`, async ({
      page,
    }) => {
      await installMockBackend(page);
      await page.setViewportSize(viewport);
      await openMap(page);
      const shell = page.locator(".ku-map-shell");
      const label = page.locator(".ku-building-label");
      await expect(shell).toHaveAttribute(
        "data-building-labels-visible",
        "false",
      );
      await expect(label).toBeHidden();

      await page.locator(".leaflet-container").dblclick({
        position: { x: viewport.width / 2, y: viewport.height / 3 },
      });
      await expect(shell).toHaveAttribute(
        "data-building-labels-visible",
        "true",
      );
      await expect(label).toBeVisible();
      await expect(page.getByTestId("landmark-label")).toBeVisible();
    });
  }
});
