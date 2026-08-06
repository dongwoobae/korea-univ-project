import { expect, test } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

/**
 * 요약 카드 숫자와 목록 개수가 일치하는지 검증한다.
 *
 * `admin_building_flags` 뷰를 도입한 이유가 이 일치이므로, mock 백엔드도
 * 프로덕션과 같은 구조여야 한다 — 카드 집계(RPC)와 목록 필터(뷰)가 mock 안에서
 * **한 벌의 플래그 계산**을 공유한다. 둘을 따로 계산하면 이 스펙이 초록불이어도
 * 아무것도 보장하지 못한다.
 */

const FLAG_CARDS = [
  { label: "시설 정보 없음", expected: ["빈터", "위치없는관"] },
  { label: "사진 없음", expected: ["사진없는관", "위치없는관"] },
  { label: "위치 없음", expected: ["위치없는관"] },
  { label: "갱신일 오래됨", expected: ["오래된관"] },
  { label: "번역 필요", expected: ["번역대기관"] },
];

/** 플래그를 하나씩 트립시키는 건물을 얹는다. 기존 픽스처는 건드리지 않는다. */
function seedFlaggedBuildings(state: MockState) {
  const polygon = state.buildings[0].geojson;
  const building = (
    id: number,
    name: string,
    overrides: Record<string, unknown>,
  ) => ({
    id,
    name,
    name_en: null,
    campus: null,
    college_id: null,
    is_deleted: false,
    geojson: polygon,
    last_updated: "2026-07-23",
    ...overrides,
  });
  const facility = (id: string, buildingId: number, status: string) => ({
    id,
    building_id: buildingId,
    facility_code: "ramp",
    name: `${id} 경사로`,
    name_en: null,
    name_zh: null,
    translation_status: status,
    is_installed: true,
    lat: 37.5894,
    lng: 127.0325,
    facility_types: null,
    created_at: "2026-07-21T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
  });
  const photo = (id: number, buildingId: number) => ({
    id,
    building_id: buildingId,
    url: `https://cdn.test/building-${buildingId}.webp`,
    caption: null,
    caption_en: null,
    caption_zh: null,
    created_at: "2026-07-22T00:00:00Z",
  });

  state.buildings.push(
    building(2, "사진없는관", {}), // 사진만 없음
    building(3, "위치없는관", { geojson: null }), // 시설·사진·위치 셋 다 없음
    building(4, "번역대기관", {}), // 번역 대기 시설을 가짐
    building(5, "오래된관", { last_updated: "2024-01-01" }), // 갱신일만 오래됨
    building(6, "빈터", {}), // 시설만 없음
  );
  state.facilities.push(
    facility("f-photoless", 2, "translated"),
    facility("f-pending", 4, "pending"),
    facility("f-old", 5, "translated"),
  );
  state.photos.push(photo(4, 4), photo(5, 5), photo(6, 6));
}

test.describe("건물 관리 경고 카드 필터", () => {
  test("경고 카드를 누르면 목록이 카드 숫자와 같은 개수로 좁혀진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedFlaggedBuildings(state);

    await page.goto("/admin/dashboard/buildings");

    const overview = page.getByRole("group", { name: "관리자 보완 현황" });
    const table = page.getByRole("table", { name: "건물 목록" });
    await expect(overview).toBeVisible();
    await expect(page.getByText("총 6개 · 삭제됨 0개")).toBeVisible();

    for (const { label, expected } of FLAG_CARDS) {
      const card = overview.getByRole("button", { name: new RegExp(label) });

      // 카드가 내건 숫자를 화면에서 그대로 읽는다. 하드코딩하면 카드와 목록이
      // 함께 틀려도 통과한다. `번역 필요`만 두 숫자(시설·건물)를 갖는데
      // 목록이 거르는 대상은 뒤쪽(건물)이므로 마지막 part를 본다.
      const shown = Number(
        await card
          .locator(".ku-admin-overview-part")
          .last()
          .locator("strong")
          .innerText(),
      );
      expect(shown).toBe(expected.length);

      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("status", {
          name: `총 ${shown}개 중 현재 ${shown}개 표시`,
        }),
      ).toBeVisible();
      await expect(table.getByRole("row")).toHaveCount(expected.length + 1);
      for (const name of expected) {
        await expect(table.getByText(name, { exact: true })).toBeVisible();
      }

      // 같은 카드를 다시 누르면 필터가 꺼져 전체 목록으로 돌아온다.
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByRole("status", { name: "총 6개 중 현재 6개 표시" }),
      ).toBeVisible();
    }
  });

  test("필터와 검색어는 AND로 걸리고 초기화가 둘 다 푼다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedFlaggedBuildings(state);

    await page.goto("/admin/dashboard/buildings");

    const overview = page.getByRole("group", { name: "관리자 보완 현황" });
    const table = page.getByRole("table", { name: "건물 목록" });
    await overview.getByRole("button", { name: /사진 없음/ }).click();
    await expect(
      page.getByRole("status", { name: "총 2개 중 현재 2개 표시" }),
    ).toBeVisible();

    await page.getByRole("searchbox", { name: "건물명 검색" }).fill("위치");
    await expect(
      page.getByRole("status", { name: "총 1개 중 현재 1개 표시" }),
    ).toBeVisible();
    await expect(table.getByText("위치없는관", { exact: true })).toBeVisible();
    await expect(table.getByText("사진없는관", { exact: true })).toBeHidden();

    await page.getByRole("button", { name: "초기화" }).click();
    await expect(
      page.getByRole("status", { name: "총 6개 중 현재 6개 표시" }),
    ).toBeVisible();
    await expect(
      overview.getByRole("button", { name: /사진 없음/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("경고 0건인 카드를 눌러도 빈 목록이 정상 표시되고 id=in.()을 보내지 않는다", async ({
    page,
  }) => {
    // 기본 픽스처(건물 1개)는 다섯 플래그가 모두 0이다.
    await installMockBackend(page, { authenticated: true });
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));

    await page.goto("/admin/dashboard/buildings");

    const overview = page.getByRole("group", { name: "관리자 보완 현황" });
    const card = overview.getByRole("button", { name: /사진 없음/ });
    await expect(card).toContainText("0개");
    await card.click();

    await expect(
      page.getByText("‘사진 없음’에 해당하는 건물이 없습니다."),
    ).toBeVisible();
    await expect(page.getByRole("table", { name: "건물 목록" })).toBeHidden();

    // 플래그 조회는 실제로 나갔지만, 0건이므로 빈 배열을 .in()에 넘기지 않는다.
    expect(
      requestUrls.some((url) => url.includes("admin_building_flags")),
    ).toBe(true);
    expect(
      requestUrls.filter((url) => /id=in\.(\(\)|%28%29)/.test(url)),
    ).toEqual([]);
  });
});
