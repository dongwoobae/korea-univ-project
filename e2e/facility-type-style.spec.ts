import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-26-facility-type-management-design.md 2장 — 아이콘·색은 코드가 아니라 종류 행에서 온다.
// route.fetch()는 목 백엔드의 전역 라우트를 거치지 않고 실제 주소로 나가므로, 목 픽스처와 같은 행을 직접 돌려준다.
const MOCK_TYPES = [
  {
    code: "elevator",
    label: "엘리베이터",
    label_en: "Elevator",
    label_zh: "电梯",
    icon: "elevator",
    color: "#2D5FB0",
  },
  {
    code: "ramp",
    label: "경사로",
    label_en: "Ramp",
    label_zh: "坡道",
    icon: "trending-up",
    color: "#B25617",
  },
  {
    code: "parking",
    label: "장애인 주차",
    label_en: "Accessible parking",
    label_zh: "无障碍停车",
    icon: "square-parking",
    color: "#6D4AB0",
  },
];

async function serveTypes(page: Page, rows: Record<string, unknown>[]) {
  await page.route(
    (url) => url.pathname.endsWith("/rest/v1/facility_types"),
    (route) =>
      route.request().method() !== "GET"
        ? route.fallback()
        : route.fulfill({
            status: 200,
            headers: { "access-control-allow-origin": "*" },
            contentType: "application/json",
            body: JSON.stringify(rows),
          }),
  );
}

// 경사로 행의 아이콘·색을 바꿔 돌려주면 코드 매핑(trending-up·주황)이 아니라 그 값으로 그려야 한다
async function serveRampAsLounge(page: Page) {
  await serveTypes(
    page,
    MOCK_TYPES.map((row) =>
      row.code === "ramp" ? { ...row, icon: "sofa", color: "#0F766E" } : row,
    ),
  );
}

test("공개 지도는 종류 행의 아이콘·색으로 필터 칩과 마커를 그린다", async ({
  page,
}) => {
  await installMockBackend(page);
  await serveRampAsLounge(page);
  await page.goto("/");
  await page.getByRole("button", { name: "시설", exact: true }).click();
  const chip = page.getByRole("button", { name: /경사로/ });
  await expect(chip.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(chip).toHaveAttribute("style", /--chip-color:\s*#0F766E/i);

  await chip.click();
  const marker = page.locator(
    '[data-testid^="facility-marker-"]:not([data-testid$="cluster"])',
  );
  await expect(marker.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
});

test("코드가 모르는 종류도 종류 행의 아이콘·색으로 칩과 마커를 그린다", async ({
  page,
}) => {
  const state = await installMockBackend(page);
  const base = state.facilities.find(
    (facility) => facility.id === "f-installed",
  )!;
  state.facilities.push({
    ...base,
    id: "f-lounge",
    name: "학생 휴게실",
    facility_code: "type_lounge01",
    lat: Number(base.lat) + 0.0004,
    facility_types: {
      code: "type_lounge01",
      label: "휴게실",
      label_en: "Lounge",
      label_zh: "休息室",
    },
  });
  await serveTypes(page, [
    ...MOCK_TYPES,
    {
      code: "type_lounge01",
      label: "휴게실",
      label_en: "Lounge",
      label_zh: "休息室",
      icon: "sofa",
      color: "#0F766E",
    },
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "시설", exact: true }).click();
  const chip = page.getByRole("button", { name: /휴게실/ });
  await expect(chip.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(chip).toHaveAttribute("style", /--chip-color:\s*#0F766E/i);

  await chip.click();
  const marker = page.locator(
    '[data-testid^="facility-marker-"]:not([data-testid$="cluster"])',
  );
  await expect(marker.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
});

test("관리자 독립 시설 목록은 종류 행의 아이콘·색으로 그린다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await serveRampAsLounge(page);
  await page.goto("/admin/dashboard/facilities");
  const row = page
    .getByRole("region", { name: "독립 시설", exact: true })
    .getByRole("button", { name: /중앙광장 경사로/ });
  await expect(row.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(row.locator(".ku-workspace-row-icon")).toHaveCSS(
    "background-color",
    "rgb(15, 118, 110)",
  );
});
