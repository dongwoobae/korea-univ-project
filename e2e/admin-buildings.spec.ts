import { expect, test } from "@playwright/test";
import { installMockBackend, stationBuildingRow } from "./support/mockBackend";
import { expectMinZoom } from "./support/mapZoom";

test.describe("건물 관리자 흐름", () => {
  test("건물 보완 필요 현황을 서버 집계로 표시한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings.push(
      {
        id: 2,
        name: "정보 부족 건물",
        name_en: null,
        campus: null,
        college_id: null,
        is_deleted: false,
        geojson: null,
        last_updated: "2026-07-23",
      },
      {
        id: 3,
        name: "갱신 필요 건물",
        name_en: "Building to update",
        campus: null,
        college_id: null,
        is_deleted: false,
        geojson: state.buildings[0].geojson,
        last_updated: "2024-01-01",
      },
    );
    state.facilities.push({
      id: "f-needs-translation",
      building_id: 3,
      facility_code: "ramp",
      name: "후문 경사로",
      name_en: null,
      name_zh: null,
      translation_status: "failed",
      is_installed: true,
      lat: 37.5894,
      lng: 127.0325,
      facility_types: null,
      created_at: "2026-07-21T00:00:00Z",
      updated_at: "2026-07-22T00:00:00Z",
    });
    state.photos.push({
      id: 2,
      building_id: 3,
      url: "https://cdn.test/building-3.webp",
      caption: null,
      caption_en: null,
      caption_zh: null,
      created_at: "2026-07-22T00:00:00Z",
    });

    await page.goto("/admin/dashboard/buildings");

    const overview = page.getByRole("group", {
      name: "관리자 보완 현황",
    });
    await expect(overview).toBeVisible();
    await expect(overview.getByText("등록된 시설").locator("..")).toContainText(
      "5개",
    );
    await expect(
      overview.getByText("시설 정보 없음").locator(".."),
    ).toContainText("1개");
    await expect(overview.getByText("사진 없음").locator("..")).toContainText(
      "1개",
    );
    await expect(overview.getByText("위치 없음").locator("..")).toContainText(
      "1개",
    );
    await expect(
      overview.getByText("갱신일 오래됨").locator(".."),
    ).toContainText("1개");
    await expect(overview.getByText("번역 필요").locator("..")).toContainText(
      "2개",
    );

    await page.evaluate(() => {
      window.sessionStorage.setItem("admin-refresh-sentinel", "kept");
    });
    state.buildings.push({
      id: 4,
      name: "새로 추가된 건물",
      name_en: "New building",
      campus: null,
      college_id: null,
      is_deleted: false,
      geojson: state.buildings[0].geojson,
      last_updated: "2026-07-23",
    });
    await page.getByRole("button", { name: "새로고침" }).click();

    await expect(page.getByText("총 4개 · 삭제됨 0개")).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: "건물 목록" })
        .getByText("새로 추가된 건물"),
    ).toBeVisible();
    await expect(
      overview.getByText("시설 정보 없음").locator(".."),
    ).toContainText("2개");
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem("admin-refresh-sentinel"),
      ),
    ).toBe("kept");
  });

  test("건물 목록을 서버 페이지 단위로 조회하고 모바일에서 이동한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings.push(
      ...Array.from({ length: 20 }, (_, index) => ({
        id: index + 2,
        name: `추가 건물 ${String(index + 1).padStart(2, "0")}`,
        name_en: `Extra building ${index + 1}`,
        campus: null,
        college_id: null,
        is_deleted: false,
        geojson: state.buildings[0].geojson,
        last_updated: "2026-07-23",
      })),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/buildings");

    await expect(
      page.getByRole("status", { name: "총 21개 중 현재 20개 표시" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "1 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "2 페이지" }).click();
    await expect(
      page.getByRole("status", { name: "총 21개 중 현재 1개 표시" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "2 페이지" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "이전" }).click();
    await expect(
      page.getByRole("button", { name: "1 페이지" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("폴리곤 편집기 지도는 14까지만 축소된다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");
    // 편집기는 줌 18로 연다
    await expectMinZoom(page.locator(".leaflet-container"), 18, 14);
  });

  test("건물 생성 필수값을 검증하고 폴리곤을 그려 저장한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page.getByText("건물 이름을 입력해주세요")).toBeVisible();

    await page.getByPlaceholder("예: 신공학관").fill("E2E 신관");
    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(
      page.getByText("폴리곤을 그려주세요", { exact: true }),
    ).toBeVisible();

    const map = page.locator(".leaflet-container");
    // 관리자 지도에는 공개 지도의 .ku-attribution 오버레이가 없다. 기본 컨트롤이
    // 유일한 표기 수단이므로 눈에 보여야 한다.
    const adminAttribution = page.locator(".leaflet-control-attribution");
    await expect(adminAttribution).toBeVisible();
    await expect(adminAttribution).toContainText("OpenStreetMap");
    await expect(adminAttribution).toContainText("CARTO");
    await expect(adminAttribution).toContainText("Leaflet");

    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    await expect(map).toHaveClass(/geoman-draw-cursor/);
    const points = [
      { x: 350, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 250 },
      { x: 350, y: 250 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[0] });

    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "폴리곤 변경 저장" }),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "폴리곤 지우고 다시 그리기" })
      .click();
    const resetConfirm = page
      .getByText("그린 폴리곤을 지우고 다시 그릴까요?")
      .locator("..");
    await expect(resetConfirm).toBeVisible();
    await resetConfirm
      .getByRole("button", { name: "취소", exact: true })
      .click();
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "폴리곤 지우고 다시 그리기" })
      .click();
    const confirmedReset = page
      .getByText("그린 폴리곤을 지우고 다시 그릴까요?")
      .locator("..");
    await confirmedReset
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toHaveCount(0);
    await expect(map).toHaveClass(/geoman-draw-cursor/);

    const replacementPoints = [
      { x: 360, y: 110 },
      { x: 490, y: 110 },
      { x: 490, y: 240 },
      { x: 360, y: 240 },
    ];
    for (const position of replacementPoints) await map.click({ position });
    await map.click({ position: replacementPoints[0] });
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page).toHaveURL(/admin\/buildings\/-\d+$/);
    expect(
      state.buildings.some((building) => building.name === "E2E 신관"),
    ).toBeTruthy();
  });

  test("폴리곤을 그릴 때 주변 건물 외곽선에 붙지 않는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    type Ring = { geometry: { coordinates: number[][][] } };
    const ringOf = (geojson: unknown) =>
      (geojson as Ring).geometry.coordinates[0];
    const neighborRing = ringOf(state.buildings[0].geojson);
    const neighborMaxLng = Math.max(...neighborRing.map(([lng]) => lng));
    const neighborMaxLat = Math.max(...neighborRing.map(([, lat]) => lat));
    await page.goto("/admin/buildings/new");
    await page.getByPlaceholder("예: 신공학관").fill("E2E 스냅 확인");

    const map = page.locator(".leaflet-container");
    const neighbor = map.locator('path[stroke="#9ca3af"]');
    await expect(neighbor).toHaveCount(1);
    const mapBox = (await map.boundingBox())!;
    const neighborBox = (await neighbor.boundingBox())!;
    const cornerX = neighborBox.x + neighborBox.width - mapBox.x;
    const cornerY = neighborBox.y - mapBox.y;

    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    const first = { x: cornerX + 90, y: cornerY - 6 };
    // 두 번째 꼭짓점은 주변 건물 오른쪽 위 모서리에서 geoman 기본 snapDistance 안쪽이다
    const points = [
      first,
      { x: cornerX + 6, y: cornerY - 6 },
      { x: cornerX + 90, y: cornerY + 70 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: first });
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page).toHaveURL(/admin\/buildings\/-\d+$/);
    const saved = state.buildings.find(
      (building) => building.name === "E2E 스냅 확인",
    );
    const [lng, lat] = ringOf(saved!.geojson)[1];
    expect(lng).not.toBe(neighborMaxLng);
    expect(lat).not.toBe(neighborMaxLat);
  });

  test("그린 뒤 꼭짓점을 옮기면 옮긴 모양으로 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    type Ring = { geometry: { coordinates: number[][][] } };
    await page.goto("/admin/buildings/new");
    await page.getByPlaceholder("예: 신공학관").fill("E2E 꼭짓점 편집");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    const points = [
      { x: 350, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 250 },
      { x: 350, y: 250 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[0] });
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();

    await page.locator(".leaflet-pm-icon-edit").locator("..").click();
    const mapBox = (await map.boundingBox())!;
    await page.mouse.move(mapBox.x + 500, mapBox.y + 250);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + 580, mapBox.y + 310, { steps: 8 });
    await page.mouse.up();

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page).toHaveURL(/admin\/buildings\/-\d+$/);
    const saved = state.buildings.find(
      (building) => building.name === "E2E 꼭짓점 편집",
    );
    const ring = (saved!.geojson as Ring).geometry.coordinates[0];
    // 둘째·셋째 꼭짓점은 같은 x에 찍었으므로, 셋째를 옮기지 않았다면 경도가 같다
    expect(ring[2][0]).toBeGreaterThan(ring[1][0]);
  });

  test("그린 뒤 통째로 옮기면 옮긴 자리로 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    type Ring = { geometry: { coordinates: number[][][] } };
    const ringOf = (geojson: unknown) =>
      (geojson as Ring).geometry.coordinates[0];
    const neighborMaxLng = Math.max(
      ...ringOf(state.buildings[0].geojson).map(([lng]) => lng),
    );
    await page.goto("/admin/buildings/new");
    await page.getByPlaceholder("예: 신공학관").fill("E2E 통째 이동");

    const map = page.locator(".leaflet-container");
    const neighbor = map.locator('path[stroke="#9ca3af"]');
    await expect(neighbor).toHaveCount(1);
    const mapBox = (await map.boundingBox())!;
    const neighborBox = (await neighbor.boundingBox())!;
    const edgeX = neighborBox.x + neighborBox.width - mapBox.x;
    const topY = neighborBox.y - mapBox.y;

    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    // 주변 건물 오른쪽 변보다 오른쪽에 그린 뒤, 그 변을 넘도록 왼쪽으로 옮긴다
    const points = [
      { x: edgeX + 60, y: topY + 10 },
      { x: edgeX + 140, y: topY + 10 },
      { x: edgeX + 140, y: topY + 80 },
      { x: edgeX + 60, y: topY + 80 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[0] });
    await expect(
      page.getByText(
        "✅ 폴리곤 입력 완료 — 아래 건물 저장 버튼으로 함께 저장됩니다.",
      ),
    ).toBeVisible();

    await page.locator(".leaflet-pm-icon-drag").locator("..").click();
    // 꼭짓점을 찍는 동안 지도가 화면 안으로 스크롤되므로 페이지 좌표를 다시 잰다
    const scrolledBox = (await map.boundingBox())!;
    await page.mouse.move(
      scrolledBox.x + edgeX + 100,
      scrolledBox.y + topY + 45,
    );
    await page.mouse.down();
    await page.mouse.move(
      scrolledBox.x + edgeX - 20,
      scrolledBox.y + topY + 45,
      {
        steps: 8,
      },
    );
    await page.mouse.up();

    await page.getByRole("button", { name: "건물 저장" }).click();
    await expect(page).toHaveURL(/admin\/buildings\/-\d+$/);
    const saved = state.buildings.find(
      (building) => building.name === "E2E 통째 이동",
    );
    const savedMinLng = Math.min(...ringOf(saved!.geojson).map(([lng]) => lng));
    expect(savedMinLng).toBeLessThan(neighborMaxLng);
  });

  test("점 데이터인 역은 프리뷰에 그 점을 찍어 그 자리에서 열고, 편집기는 점 없이 폴리곤이 없는 건물처럼 연다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings.push(stationBuildingRow(90, "안암역", [127.0316, 37.5889]));
    await page.goto("/admin/buildings/90");

    const preview = page.getByRole("img", { name: "건물 폴리곤 미리보기" });
    const dot = preview.locator('path[stroke="#2563EB"]');
    await expect(dot).toHaveCount(1);
    const previewBox = (await preview.boundingBox())!;
    const dotBox = (await dot.boundingBox())!;
    expect(
      Math.abs(
        dotBox.x + dotBox.width / 2 - (previewBox.x + previewBox.width / 2),
      ),
    ).toBeLessThan(3);
    expect(
      Math.abs(
        dotBox.y + dotBox.height / 2 - (previewBox.y + previewBox.height / 2),
      ),
    ).toBeLessThan(3);
    await expect(page.locator("img.leaflet-marker-icon")).toHaveCount(0);

    await page
      .locator("#building-polygon")
      .getByRole("button", { name: "편집" })
      .click();
    const map = page.locator(".leaflet-container");
    await expect(page.locator(".leaflet-pm-icon-polygon")).toBeVisible();
    await expect(page.locator("img.leaflet-marker-icon")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "폴리곤 지우고 다시 그리기" }),
    ).toHaveCount(0);
    await page.locator(".leaflet-pm-icon-polygon").locator("..").click();
    await expect(map).toHaveClass(/geoman-draw-cursor/);
  });

  test("건물명 수정과 소프트 삭제·복원을 수행한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    // 공개 시설 목록은 삭제된 건물의 시설을 빼고 캐시된다 — 삭제·복구가 캐시를 비워야 한다.
    let facilityRevalidations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/revalidate-facilities"))
        facilityRevalidations += 1;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/buildings/1");

    const nameCard = page.locator("#building-name");
    await nameCard.locator("input").first().fill("중앙도서관 E2E");
    await expect(
      page.getByRole("status", { name: "저장하지 않은 변경 1개" }),
    ).toBeVisible();
    await expect(nameCard.getByText("저장 안 됨")).toBeVisible();

    await page.getByRole("button", { name: "지도 보기" }).click();
    await expect(
      page.getByText("저장하지 않은 변경사항이 있어요"),
    ).toBeVisible();
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page).toHaveURL(/admin\/buildings\/1$/);

    await nameCard.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("건물명이 저장되었어요!")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "저장하지 않은 변경 1개" }),
    ).toHaveCount(0);
    await expect(nameCard.getByText("저장 안 됨")).toHaveCount(0);
    expect(state.buildings[0].name).toBe("중앙도서관 E2E");

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "건물 삭제" }).click();
    await page.getByText(/건물을 삭제 처리할까요/).waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "복구", exact: true }).click();
    await expect(page.getByRole("button", { name: /건물 복구/ })).toBeVisible();
    expect(facilityRevalidations).toBe(1);

    await page.getByRole("button", { name: /건물 복구/ }).click();
    await expect(page.getByRole("button", { name: "건물 삭제" })).toBeVisible();
    await expect.poll(() => facilityRevalidations).toBe(2);

    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
    await expect(
      dialog.getByRole("status", { name: "현재 상태: 설치" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "미설치로 변경" }).click();
    await expect(
      dialog.getByRole("status", { name: "현재 상태: 미설치" }),
    ).toBeVisible();
  });

  test("한 칸을 저장해도 다른 칸에 입력하던 값은 남는다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.buildings[0].college_id = null;
    await page.goto("/admin/buildings/1");

    const nameInput = page.locator("#building-name input").first();
    const collegeCard = page.locator("#building-college");
    const collegeSelect = collegeCard.getByLabel("소속 단과대학 선택");

    await nameInput.fill("중앙도서관 고치는 중");
    await collegeSelect.selectOption({ label: "문과대학" });
    await collegeCard.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("소속 단과대학이 저장되었어요!")).toBeVisible();
    await expect(nameInput).toHaveValue("중앙도서관 고치는 중");
    await expect(
      page.getByRole("status", { name: "저장하지 않은 변경 1개" }),
    ).toBeVisible();

    await collegeSelect.selectOption({ label: "선택 안 함" });
    await page
      .locator("#building-name")
      .getByRole("button", { name: "저장" })
      .click();
    await expect(page.getByText("건물명이 저장되었어요!")).toBeVisible();
    await expect(collegeSelect).toHaveValue("");
    await expect(
      page.getByRole("status", { name: "저장하지 않은 변경 1개" }),
    ).toBeVisible();
    expect(state.buildings[0].name).toBe("중앙도서관 고치는 중");
    expect(state.buildings[0].college_id).toBe(1);
  });

  test("건물 사진의 파일별 성공·실패를 표시하고 실패만 재시도한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failPhotoUploads: 1,
    });
    await page.goto("/admin/buildings/1");
    const photoSection = page.locator("#building-photos");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlAAAAABJRU5ErkJggg==",
      "base64",
    );

    await photoSection.locator('input[type="file"]').setInputFiles([
      { name: "정문.png", mimeType: "image/png", buffer: png },
      { name: "후문.png", mimeType: "image/png", buffer: png },
    ]);

    const progress = photoSection.getByLabel("사진 업로드 진행 상황");
    await expect(progress.getByText("정문.png")).toBeVisible();
    await expect(progress.getByText("후문.png")).toBeVisible();
    await expect(progress.getByText("실패 · 테스트 업로드 실패")).toBeVisible();
    await expect(progress.getByText("완료", { exact: true })).toBeVisible();
    await expect(
      progress.getByRole("status", { name: /성공 1개 · 실패 1개/ }),
    ).toBeVisible();
    await progress
      .getByRole("button", { name: "실패한 사진 다시 시도" })
      .click();

    await expect(
      progress.getByRole("status", { name: /성공 2개 · 실패 0개/ }),
    ).toBeVisible();
    await expect(
      progress.getByRole("button", { name: "실패한 사진 다시 시도" }),
    ).toHaveCount(0);
    await expect(
      progress.getByRole("button", { name: "업로드 결과 닫기" }),
    ).toBeVisible();
    expect(state.photoUploadAttempts).toBe(3);
    expect(state.photos).toHaveLength(3);
  });

  test("Safari처럼 canvas가 WebP를 못 만들면 wasm으로 WebP를 만들어 올린다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        return original.call(
          this,
          callback,
          type === "image/webp" ? "image/png" : type,
          quality,
        );
      };
    });
    const bodies: Buffer[] = [];
    await page.route("**/api/upload-building-photo", async (route) => {
      bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
      await route.fallback();
    });
    await page.goto("/admin/buildings/1");
    const photoSection = page.locator("#building-photos");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlAAAAABJRU5ErkJggg==",
      "base64",
    );

    await photoSection
      .locator('input[type="file"]')
      .setInputFiles([
        { name: "정문.png", mimeType: "image/png", buffer: png },
      ]);

    const progress = photoSection.getByLabel("사진 업로드 진행 상황");
    await expect(
      progress.getByRole("status", { name: /성공 1개 · 실패 0개/ }),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].includes(Buffer.from("WEBPVP8"))).toBe(true);
    expect(bodies[0].includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
      false,
    );
  });
});
