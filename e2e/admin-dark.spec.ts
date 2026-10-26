import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

/**
 * 다크 모드 대비 회귀 가드 (UX-P0-03).
 *
 * 픽셀 스냅샷 대신 computed-style을 스캔한다: 시스템 다크 모드에서
 * 관리자 화면에 (1) 다크 미디어쿼리가 실제 적용되고, (2) 미이관 하드코딩
 * 흰 배경(#fff류)이나 (3) 근검정 텍스트(#111류)가 남아 있지 않음을 단언한다.
 * 하드코딩 색상은 다크 토큰으로 반전되지 않으므로 이 스캔에 잡힌다.
 */

interface Violations {
  darkActive: boolean;
  bodyBg: string;
  nearWhiteBg: string[];
  nearBlackText: string[];
}

async function scanContrast(page: import("@playwright/test").Page) {
  return page.evaluate<Violations>(() => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((x) => parseFloat(x));
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts[3] === undefined ? 1 : parts[3],
      };
    };
    const label = (el: Element, extra = "") =>
      `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").trim()}${extra}`;

    const nearWhiteBg: string[] = [];
    const nearBlackText: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      // Leaflet 지도 위젯(타일·툴팁·컨트롤)은 서드파티 UI로 P0-03 범위 밖
      // (다크 베이스맵은 별도 항목 UX-P2-02). 관리자 콘텐츠만 검사한다.
      if (el.closest(".leaflet-container") || el.closest(".leaflet-control"))
        continue;
      const cs = getComputedStyle(el);
      const bg = parse(cs.backgroundColor);
      // 불투명한 근백색 배경 = 반전되지 않은 하드코딩 흰색
      if (bg && bg.a === 1 && bg.r >= 245 && bg.g >= 245 && bg.b >= 245) {
        nearWhiteBg.push(label(el));
      }
      // 자기 자신이 직접 텍스트 노드를 가진 요소만 검사
      const ownsText = Array.from(el.childNodes).some(
        (node) => node.nodeType === 3 && (node.textContent ?? "").trim(),
      );
      if (ownsText) {
        const fg = parse(cs.color);
        if (fg && fg.a === 1 && fg.r <= 25 && fg.g <= 25 && fg.b <= 25) {
          nearBlackText.push(
            label(el, ` "${(el.textContent ?? "").trim().slice(0, 24)}"`),
          );
        }
      }
    }
    return {
      darkActive: getComputedStyle(
        document.documentElement,
      ).colorScheme.includes("dark"),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      nearWhiteBg,
      nearBlackText,
    };
  });
}

const SCREENS = [
  { name: "건물 목록", path: "/admin/dashboard/buildings" },
  { name: "시설 목록", path: "/admin/dashboard/facilities" },
  { name: "경사도 목록", path: "/admin/dashboard/slopes" },
  { name: "경사도 보기 패널", path: "/admin/dashboard/slopes?id=2" },
  { name: "명소 목록", path: "/admin/dashboard/landmarks" },
  { name: "제보함", path: "/admin/dashboard/inbox" },
  { name: "로그", path: "/admin/dashboard/logs" },
  { name: "건물 상세", path: "/admin/buildings/1" },
  { name: "건물 신규 등록", path: "/admin/buildings/new" },
  { name: "경사도 경로 그리기", path: "/admin/dashboard/slopes?new=1" },
  { name: "경사도 경로 수정", path: "/admin/dashboard/slopes?id=2&edit=1" },
];

test.describe("관리자 다크 모드 대비 회귀 가드 (P0-03)", () => {
  test.use({ colorScheme: "dark" });

  for (const screen of SCREENS) {
    test(`${screen.name} 화면에 하드코딩 밝은 색이 남지 않는다`, async ({
      page,
    }) => {
      await installMockBackend(page, { authenticated: true });
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");

      const result = await scanContrast(page);
      expect(result.darkActive).toBe(true);
      // 다크 배경이 실제로 적용됨 (밝은 배경이 아님)
      expect(result.bodyBg).not.toBe("rgb(255, 255, 255)");
      expect(
        result.nearWhiteBg,
        `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    });
  }

  test("시설 폼 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });

  test("범례 편집 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await page
      .getByRole("region", { name: "경사도 경로", exact: true })
      .getByRole("button", { name: "범례 편집" })
      .click();
    await expect(page.getByRole("dialog", { name: "범례 편집" })).toBeVisible();

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });

  test("시설 종류 관리 모달에 하드코딩 밝은 색이 남지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await page
      .getByRole("region", { name: "독립 시설", exact: true })
      .getByRole("button", { name: "종류 관리" })
      .click();
    const dialog = page.getByRole("dialog", { name: "시설 종류 관리" });
    await expect(
      dialog.getByText("시설 2곳이 이 종류를 써요").first(),
    ).toBeVisible();

    for (const view of ["목록", "폼"] as const) {
      if (view === "폼")
        await dialog.getByRole("button", { name: "＋ 종류 추가" }).click();
      const result = await scanContrast(page);
      expect(
        result.nearWhiteBg,
        `${view} 미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `${view} 미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    }
  });

  test("로그 상세 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/logs");
    await page
      .getByRole("list", { name: "로그 목록" })
      .getByRole("button")
      .nth(2)
      .click();
    await page.getByRole("dialog").getByText("원문(개발자용)").click();

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });

  test("크림슨 채움은 모드마다 흰 글자 대비를 지키는 값이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    // 메뉴 배지는 신규 요청이 있을 때만 그려진다.
    state.facilityRequests.push({ id: "dark-badge-request", status: "new" });
    await page.goto("/admin/dashboard/buildings");
    const badge = page.locator(".ku-admin-nav-badge");
    await expect(badge).toHaveCSS("background-color", "rgb(204, 41, 54)");
    await expect(badge).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.goto("/admin/buildings/1");
    const add = page.getByRole("button", { name: "+ 시설 추가" });
    await expect(add).toHaveCSS("background-color", "rgb(204, 41, 54)");
    await expect(add).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(add).toHaveCSS("background-color", "rgb(140, 0, 0)");
  });

  test("독립 시설 상세 패널에 하드코딩 밝은 색이 남지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities?id=f-installed");
    await expect(
      page.getByRole("region", { name: "중앙광장 경사로", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    for (const step of ["보기", "새로 만들기"]) {
      if (step === "새로 만들기") {
        await page.getByRole("button", { name: "＋ 시설 추가" }).click();
        await expect(
          page.getByRole("region", { name: "시설 추가", exact: true }),
        ).toBeVisible();
      }
      const result = await scanContrast(page);
      expect(
        result.nearWhiteBg,
        `${step} — 미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `${step} — 미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    }
  });
  test("명소 상세 패널에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(
      "/admin/dashboard/landmarks?id=11111111-1111-1111-1111-111111111111",
    );
    await expect(
      page.getByRole("region", { name: "다람쥐길", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    for (const step of ["보기", "직접 고치기", "새로 만들기"]) {
      if (step === "직접 고치기") {
        await page.getByRole("button", { name: "직접 고치기" }).click();
      }
      if (step === "새로 만들기") {
        await page.getByRole("button", { name: "＋ 명소 추가" }).click();
        await expect(
          page.getByRole("region", { name: "명소 추가", exact: true }),
        ).toBeVisible();
      }
      const result = await scanContrast(page);
      expect(
        result.nearWhiteBg,
        `${step} — 미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `${step} — 미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    }
  });

  test("명소 이모지 피커에 하드코딩 밝은 색이 남지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto(
      "/admin/dashboard/landmarks?id=11111111-1111-1111-1111-111111111111",
    );
    const detail = page.getByRole("region", { name: "다람쥐길", exact: true });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: /이모지 .* 바꾸기/ }).click();
    await expect(
      page.getByRole("group", { name: "이모지 선택" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });

  test("제보함 등록 요청 드로어에 하드코딩 밝은 색이 남지 않고 승인 버튼 글자 대비를 지킨다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.facilityRequests.push({
      id: "00000000-0000-4000-8000-000000000001",
      building_id: 1,
      facility_code: "elevator",
      name: null,
      description: "엘리베이터가 있어요",
      floor_info: "3층",
      lat: 37.5894,
      lng: 127.0325,
      status: "new",
      created_at: "2026-10-08T00:00:00Z",
      reviewed_at: null,
      facility_id: null,
    });
    await page.goto("/admin/dashboard/inbox");
    await page.getByRole("listitem").first().getByRole("button").click();
    const drawer = page.getByRole("dialog", { name: /등록 요청/ });
    await expect(drawer.getByLabel("시설 유형 *")).toHaveValue("elevator");
    const locate = drawer.locator(".ku-facility-map-locate");
    await expect(locate).toBeVisible();
    await page.waitForLoadState("networkidle");

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
    // 입력·위치 버튼은 토큰 색을 쓴다(밝은 글자·어두운 면).
    await expect(drawer.getByLabel("층 정보 (선택)")).not.toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(locate).not.toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );

    const approve = drawer.getByRole("button", { name: "승인하고 등록" });
    await expect(approve).toHaveCSS("background-color", "rgb(204, 41, 54)");
    await expect(approve).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("제보함 피드백 드로어에 하드코딩 밝은 색이 남지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.feedbackSubmissions.push({
      id: "fb-1",
      feedback_type: "error",
      content: "중앙도서관 경사로 위치가 틀려요",
      page_url: "https://campus.example/",
      status: "new",
      created_at: "2026-10-08T00:00:00Z",
    });
    await page.goto("/admin/dashboard/inbox?tab=feedback");
    await page.getByRole("listitem").first().getByRole("button").click();
    const drawer = page.getByRole("dialog", { name: "오류 제보", exact: true });
    await expect(drawer).toBeVisible();
    await page.waitForLoadState("networkidle");

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });
});
