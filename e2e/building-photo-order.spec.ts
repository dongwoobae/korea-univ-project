import { expect, test, type Locator, type Page } from "@playwright/test";
import { serverError } from "./support/adminWorkspace";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.2·3.4

function photoRow(id: number, sortOrder: number, caption: string) {
  return {
    id,
    building_id: 1,
    url: `https://cdn.test/building-1-${id}.webp`,
    caption,
    caption_en: null,
    caption_zh: null,
    sort_order: sortOrder,
    created_at: `2026-07-0${id}T00:00:00Z`,
  };
}

/** 건물 1의 사진 세 장. 화면 순서는 정문 → 로비 → 야간이고 올린 순서(id·created_at)와 같다 */
function seedThreePhotos(state: MockState) {
  state.photos.splice(
    0,
    state.photos.length,
    photoRow(1, 0, "정문"),
    photoRow(2, 1, "로비"),
    photoRow(3, 2, "야간"),
  );
}

function photoSection(page: Page) {
  return page.locator("#building-photos");
}

async function expectCaptionOrder(section: Locator, captions: string[]) {
  const inputs = section.getByLabel("사진 설명");
  await expect(inputs).toHaveCount(captions.length);
  for (const [index, caption] of captions.entries())
    await expect(inputs.nth(index)).toHaveValue(caption);
}

test.describe("건물 사진 순서 — 읽기", () => {
  test("관리자 사진 칸은 올린 순서가 아니라 sort_order 순서로 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    // 밤에 찍은 사진을 맨 앞으로 옮겨 둔 상태
    state.photos[0].sort_order = 2;
    state.photos[2].sort_order = 0;

    await page.goto("/admin/buildings/1");

    await expectCaptionOrder(photoSection(page), ["야간", "로비", "정문"]);
  });

  test("공개 상세는 sort_order 순서의 첫 사진을 맨 앞에 보여 준다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.photos.splice(
      0,
      state.photos.length,
      photoRow(1, 1, "정문"),
      photoRow(2, 0, "열람실"),
    );
    await page.goto("/");
    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();

    await page.getByRole("button", { name: "사진 크게 보기" }).click();
    const dialog = page.getByRole("dialog", {
      name: "중앙도서관",
      exact: true,
    });
    await expect(dialog).toContainText("1 / 2");
    await expect(dialog).toContainText("열람실");
  });
});

function moveButton(
  section: Locator,
  position: number,
  direction: "앞으로" | "뒤로",
) {
  return section.getByRole("button", {
    name: `사진 ${position} ${direction} 옮기기`,
    exact: true,
  });
}

test.describe("건물 사진 순서 — 화살표", () => {
  test("이웃한 사진과 자리를 바꾸고 화면 순서대로 저장해 다시 열어도 그 순서다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    await expect(moveButton(section, 1, "앞으로")).toBeDisabled();
    await expect(moveButton(section, 3, "뒤로")).toBeDisabled();

    await moveButton(section, 3, "앞으로").click();
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    await expect
      .poll(() => state.photoSwapRequests)
      .toEqual([{ p_first: 2, p_second: 3 }]);

    await moveButton(section, 1, "뒤로").click();
    await expectCaptionOrder(section, ["야간", "정문", "로비"]);
    await expect
      .poll(() => state.photoSwapRequests.at(-1))
      .toEqual({ p_first: 1, p_second: 3 });

    await page.reload();
    await expectCaptionOrder(section, ["야간", "정문", "로비"]);
  });

  test("사진이 한 장이면 두 화살표가 모두 꺼져 있다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await expect(moveButton(section, 1, "앞으로")).toBeDisabled();
    await expect(moveButton(section, 1, "뒤로")).toBeDisabled();
  });

  test("키보드로 옮기면 초점이 옮긴 사진의 화살표를 따라간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await moveButton(section, 2, "뒤로").focus();
    await page.keyboard.press("Enter");
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    // 로비가 맨 끝에 닿아 뒤로가 꺼지므로 같은 사진의 앞으로로 간다
    await expect(moveButton(section, 3, "앞으로")).toBeFocused();

    await expect(moveButton(section, 3, "앞으로")).toBeEnabled();
    await page.keyboard.press("Enter");
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    await expect(moveButton(section, 2, "앞으로")).toBeFocused();
    await expect
      .poll(() => state.photoSwapRequests)
      .toEqual([
        { p_first: 2, p_second: 3 },
        { p_first: 3, p_second: 2 },
      ]);
  });

  test("저장 중에는 그 건물의 화살표를 모두 잠근다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let swapCalls = 0;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/rpc/swap_building_photo_order"),
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        swapCalls += 1;
        await held;
        await route.fallback();
      },
    );
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);

    await moveButton(section, 3, "앞으로").click();
    // 저장이 끝나기 전에 화면이 먼저 바뀐다
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
    for (const [position, direction] of [
      [1, "뒤로"],
      [2, "앞으로"],
      [2, "뒤로"],
      [3, "앞으로"],
    ] as const)
      await expect(moveButton(section, position, direction)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    await moveButton(section, 1, "뒤로").click({ force: true });

    release();
    await expect(moveButton(section, 1, "뒤로")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(swapCalls).toBe(1);
    await expectCaptionOrder(section, ["정문", "야간", "로비"]);
  });

  test("모바일 폭에서 화살표가 44px 터치 영역을 갖고 사진 칸을 넘지 않는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);

    for (let position = 1; position <= 3; position += 1) {
      const caption = (await section
        .getByLabel("사진 설명")
        .nth(position - 1)
        .boundingBox())!;
      for (const direction of ["앞으로", "뒤로"] as const) {
        const box = (await moveButton(
          section,
          position,
          direction,
        ).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(caption.x - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(
          caption.x + caption.width + 0.5,
        );
      }
    }
  });
});

function photoById(state: MockState, id: number) {
  return state.photos.find((photo) => photo.id === id)!;
}

function swapRequest(url: URL) {
  return url.pathname.endsWith("/rest/v1/rpc/swap_building_photo_order");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlAAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("건물 사진 순서 — 실패와 잠금", () => {
  test("다른 관리자가 그사이 순서를 바꿨으면 다시 불러오고 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    // 다른 관리자가 정문과 로비를 바꿨다. 이 화면은 아직 모른다
    photoById(state, 1).sort_order = 1;
    photoById(state, 2).sort_order = 0;

    // (로비, 야간) — 지금 둘 사이에 정문이 있다
    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "순서가 바뀌어 다시 불러왔어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["로비", "정문", "야간"]);
    expect(state.activityReports).toHaveLength(0);
  });

  test("그사이 지워진 사진이면 다시 불러오고 알린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    state.photos.splice(
      state.photos.findIndex((photo) => photo.id === 3),
      1,
    );

    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "순서가 바뀌어 다시 불러왔어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["정문", "로비"]);
  });

  test("다시 불러오기마저 실패하면 누르기 전 순서로 두고 오류로 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let failReads = false;
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/building_photos"),
      (route) =>
        failReads && route.request().method() === "GET"
          ? serverError(route)
          : route.fallback(),
    );
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    photoById(state, 1).sort_order = 1;
    photoById(state, 2).sort_order = 0;
    failReads = true;

    await moveButton(section, 3, "앞으로").click();

    await expect(
      page
        .locator(".ku-toast[role='alert']")
        .filter({ hasText: "사진 순서를 바꾸지 못했어요" }),
    ).toBeVisible();
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);
    expect(state.activityReports).toHaveLength(0);
  });

  for (const failure of [
    { status: 403, code: "42501", reason: "forbidden" },
    { status: 500, code: "XX000", reason: "server_error" },
  ]) {
    test(`그 밖의 실패(${failure.code})는 순서를 되돌리고 오류로 알리며 실패를 보고한다`, async ({
      page,
    }) => {
      const state = await installMockBackend(page, { authenticated: true });
      seedThreePhotos(state);
      await page.route(swapRequest, (route) =>
        route.request().method() !== "POST"
          ? route.fallback()
          : route.fulfill({
              status: failure.status,
              headers: { "access-control-allow-origin": "*" },
              contentType: "application/json",
              body: JSON.stringify({
                code: failure.code,
                message: "swap failed",
                details: null,
                hint: null,
              }),
            }),
      );
      await page.goto("/admin/buildings/1");
      const section = photoSection(page);

      await moveButton(section, 3, "앞으로").click();

      await expect(
        page
          .locator(".ku-toast[role='alert']")
          .filter({ hasText: "사진 순서를 바꾸지 못했어요" }),
      ).toBeVisible();
      await expectCaptionOrder(section, ["정문", "로비", "야간"]);
      await expect.poll(() => state.activityReports.length).toBe(1);
      expect(state.activityReports[0]).toMatchObject({
        action: "building_photos.update",
        reason_code: failure.reason,
        target_table: "building_photos",
        target_id: "3",
      });
    });
  }

  test("사진을 올리는 동안에도 화살표를 잠그고, 올린 사진은 맨 뒤에 붙는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/upload-building-photo", async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    await expectCaptionOrder(section, ["정문", "로비", "야간"]);

    await section
      .locator('input[type="file"]')
      .setInputFiles([
        { name: "새 사진.png", mimeType: "image/png", buffer: PNG },
      ]);
    await expect(moveButton(section, 2, "앞으로")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    release();
    await expectCaptionOrder(section, ["정문", "로비", "야간", ""]);
    await expect(moveButton(section, 4, "뒤로")).toBeDisabled();
    await expect(moveButton(section, 4, "앞으로")).toBeEnabled();
  });

  test("맞바꾸기를 저장하는 동안에는 사진을 올릴 수 없다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    seedThreePhotos(state);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(swapRequest, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      await route.fallback();
    });
    await page.goto("/admin/buildings/1");
    const section = photoSection(page);
    const fileInput = section.locator('input[type="file"]');

    await moveButton(section, 3, "앞으로").click();
    await expect(fileInput).toBeDisabled();

    release();
    await expect(fileInput).toBeEnabled();
  });
});
