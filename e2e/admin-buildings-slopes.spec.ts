import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물과 경사도 관리자 흐름", () => {
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

  test("건물명 수정과 소프트 삭제·복원을 수행한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
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

    await page.getByRole("button", { name: /건물 복구/ }).click();
    await expect(page.getByRole("button", { name: "건물 삭제" })).toBeVisible();

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

  test("건물 사진의 파일별 성공·실패를 표시하고 실패만 재시도한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failBuildingPhotoUploads: 1,
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
    expect(state.buildingPhotoUploadAttempts).toBe(3);
    expect(state.photos).toHaveLength(3);
  });

  test("검색으로 목록을 좁히고 초기화한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");

    await page
      .getByRole("searchbox", { name: "경사도 경로 검색" })
      .fill("중앙광장");
    await expect(page.getByText("안암병원 정문 경사로")).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "총 1개 중 현재 1개 표시" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.getByText("안암병원 정문 경사로")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "총 2개 중 현재 2개 표시" }),
    ).toBeVisible();
  });

  test("경로를 삭제한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");

    const row = page.getByText("정문-중앙광장").locator("xpath=../..");
    await row.getByRole("button", { name: "삭제" }).click();
    const deleteConfirm = page
      .getByText('"정문-중앙광장" 경로를 삭제할까요?')
      .locator("..");
    await expect(deleteConfirm).toBeVisible();
    await deleteConfirm.getByRole("button", { name: "취소" }).click();
    await expect(
      page.getByText("정문-중앙광장", { exact: true }),
    ).toBeVisible();

    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "경로 삭제" }).click();
    await expect(page.getByText("정문-중앙광장", { exact: true })).toHaveCount(
      0,
    );
  });

  test("목록에 GPX 안내·다운로드가 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");

    await expect(page.getByText("안암병원 정문 경사로")).toBeVisible();
    await expect(page.getByText(/GPX/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다운로드" })).toHaveCount(0);
    await expect(
      page.getByRole("searchbox", { name: "경사도 경로 검색" }),
    ).toHaveAttribute("placeholder", "경로명 검색");
  });

  test("수기 경로를 열어 값을 고쳐 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");

    const row = page.getByText("안암병원 정문 경사로").locator("xpath=../..");
    await row.getByRole("button", { name: "수정" }).click();
    await expect(page).toHaveURL(/\/admin\/slopes\/2$/);

    await expect(page.getByLabel("경로 이름")).toHaveValue(
      "안암병원 정문 경사로",
    );
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await page.getByLabel("구간 1 경사도").fill("9.4");
    await page.getByRole("button", { name: "경로 저장" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

    const saved = state.slopes.find((row) => row.id === 2);
    const segments = saved!.segments as Array<Record<string, unknown>>;
    expect(segments[1].slope).toBe(9.4);
  });

  test("사유 없이 목록에 들어가면 리다이렉트 안내가 뜨지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await expect(page.getByText("저장 형식이 깨진 경로라")).toHaveCount(0);
    await expect(page.getByText("경로를 찾을 수 없어요")).toHaveCount(0);
  });

  test("비로그인 상태로 수정 화면에 가면 로그인 화면으로 보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: false });
    await page.goto("/admin/slopes/2");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("수정 화면을 열면 불러온 경사값으로 미리보기 선이 그려진다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2");

    const preview = page
      .locator(".leaflet-pane.slope-preview-pane path")
      .first();
    await expect(preview).toHaveAttribute("stroke", "#AE3B1E");
  });

  test("수정 화면에서 지우고 다시 그리기를 누르면 선과 입력값이 함께 비워지고 다시 그릴 수 있다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2");

    const preview = page
      .locator(".leaflet-pane.slope-preview-pane path")
      .first();
    await expect(preview).toBeVisible();
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await page.getByRole("button", { name: "경로 지우고 다시 그리기" }).click();
    await expect(
      page.getByText("그린 경로를 지우고 다시 그릴까요?"),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();

    await expect(page.getByText("구간 1")).toHaveCount(0);
    await expect(
      page.locator(".leaflet-pm-icon-polyline").locator(".."),
    ).not.toHaveClass(/pm-disabled/);

    const map = page.locator(".leaflet-container");
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await expect(page.getByText("구간 1")).toBeVisible();
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("");
  });

  test("목록에서 경로 직접 그리기로 편집기에 들어간다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    await page.getByRole("button", { name: "경로 직접 그리기" }).click();
    await expect(page).toHaveURL(/\/admin\/slopes\/new$/);
    await expect(
      page.getByRole("heading", { name: "경사도 경로 그리기" }),
    ).toBeVisible();
  });

  test("비로그인 상태로 편집기에 가면 로그인 화면으로 보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: false });
    await page.goto("/admin/slopes/new");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await expect(map).toBeVisible();

    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
      { x: 520, y: 260 },
    ];
    for (const position of points) await map.click({ position });
    // 마지막 점을 한 번 더 눌러 선을 끝낸다.
    await map.click({ position: points[2] });

    await expect(page.getByText("구간 1")).toBeVisible();
    await expect(page.getByText("구간 2")).toBeVisible();
    await expect(page.getByText("구간 3")).toHaveCount(0);

    // 꼭짓점 삽입용 중간점 핸들이 없어야 한다.
    await expect(page.locator(".marker-icon-middle")).toHaveCount(0);

    // 꼭짓점을 오른쪽 클릭해도 지워지지 않아야 한다.
    await page.locator(".marker-icon").first().click({ button: "right" });
    await expect(page.getByText("구간 1")).toBeVisible();
    await expect(page.getByText("구간 2")).toBeVisible();

    // 선을 하나 그리면 그리기 버튼이 잠긴다.
    await expect(
      page.locator(".leaflet-pm-icon-polyline").locator(".."),
    ).toHaveClass(/pm-disabled/);
  });

  test("지우고 다시 그리기로 경로를 비운다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });
    await expect(page.getByText("구간 1")).toBeVisible();

    // 실측값을 클릭 한 번에 날리지 않는다. 취소하면 그대로 남는다.
    await page.getByRole("button", { name: "경로 지우고 다시 그리기" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page.getByText("구간 1")).toBeVisible();

    await page.getByRole("button", { name: "경로 지우고 다시 그리기" }).click();
    await expect(
      page.getByText("그린 경로를 지우고 다시 그릴까요?"),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "지우고 다시 그리기", exact: true })
      .click();
    await expect(page.getByText("구간 1")).toHaveCount(0);
    await expect(
      page.locator(".leaflet-pm-icon-polyline").locator(".."),
    ).not.toHaveClass(/pm-disabled/);
  });

  test("없는 경로 id로 수정 화면에 가면 사유와 함께 목록으로 돌려보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/999");
    await expect(
      page.getByText("경로를 찾을 수 없어요. 이미 삭제됐을 수 있어요"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
  });

  test("저장 형식이 깨진 경로는 열지 않고 목록에서 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const row = state.slopes.find((slope) => slope.id === 2)!;
    row.segments = [
      { lat: 37.5861, lng: 127.0268 },
      { lat: 37.5862, lng: 127.0269, distance: 12.4 },
    ];

    await page.goto("/admin/slopes/2");
    await expect(
      page.getByText("저장 형식이 깨진 경로라 열 수 없어요"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
  });

  test("수정 화면에서 값을 고친 채 벗어나려 하면 경고한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2");
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    await page.getByLabel("구간 1 경사도").fill("9.4");
    await page.getByRole("button", { name: "취소" }).first().click();
    await expect(
      page.getByText("저장하지 않은 변경사항이 있어요"),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("9.4");
  });

  test("열어둔 사이 행이 바뀌면 덮어쓰지 않고 알린다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2");
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");

    // 다른 곳에서 같은 행을 먼저 저장한 상황.
    const row = state.slopes.find((slope) => slope.id === 2)!;
    row.updated_at = "2026-09-01T00:00:00Z";

    await page.getByLabel("구간 1 경사도").fill("9.4");
    await page.getByRole("button", { name: "경로 저장" }).click();

    await expect(
      page.getByText("다른 곳에서 바뀌었거나 삭제된 경로예요"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/slopes\/2$/);
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("9.4");
    expect((row.segments as Array<Record<string, unknown>>)[1].slope).toBe(7.2);
  });

  test("구간 값을 넣어 저장하면 저장 포맷으로 들어간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("경로 이름").fill("안암병원 정문 경사로");

    // 값이 비어 있으면 저장이 막힌다.
    await expect(
      page.getByRole("button", { name: "경로 저장" }),
    ).toBeDisabled();

    await page.getByLabel("구간 1 경사도").fill("7.2");
    await page.getByRole("button", { name: "경로 저장" }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

    // 픽스처에도 같은 이름의 행이 있어 name으로 find하면 그쪽이 잡힌다.
    // 방금 저장한 행은 POST 처리가 배열 끝에 push하므로 마지막 행이다.
    const saved = state.slopes[state.slopes.length - 1];
    expect(saved.name).toBe("안암병원 정문 경사로");
    expect(saved.gpx_file).toBeNull();

    const segments = saved.segments as Array<Record<string, unknown>>;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
    expect(segments[1].slope).toBe(7.2);
    expect(typeof segments[1].distance).toBe("number");
    expect(segments[1].distance).toBeGreaterThan(0);
  });

  test("완화 한도와 급경사 경고를 표시하되 저장은 막지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("경로 이름").fill("급경사 시험");

    await page.getByLabel("구간 1 경사도").fill("10");
    await expect(page.getByText("1/12 완화 한도 초과")).toBeVisible();
    await expect(page.getByRole("button", { name: "경로 저장" })).toBeEnabled();

    await page.getByLabel("구간 1 경사도").fill("45");
    await expect(
      page.getByText(
        "이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "경로 저장" })).toBeEnabled();

    await page.getByLabel("구간 1 경사도").fill("120");
    await expect(
      page.getByRole("button", { name: "경로 저장" }),
    ).toBeDisabled();

    // tan(181°)는 1.75%다. % 기준 범위 검사라면 통과해 버린다(설계 3.2).
    await page.getByLabel("구간 1 경사도").fill("181");
    await expect(
      page.getByRole("button", { name: "경로 저장" }),
    ).toBeDisabled();
  });

  test("입력한 경사도에 따라 미리보기 선 색이 바뀐다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    const preview = page
      .locator(".leaflet-pane.slope-preview-pane path")
      .first();

    await page.getByLabel("구간 1 경사도").fill("1");
    await expect(preview).toHaveAttribute("stroke", "#B5AFA8");

    await page.getByLabel("구간 1 경사도").fill("10");
    await expect(preview).toHaveAttribute("stroke", "#7A1414");
  });

  test("꼭짓점을 드래그하면 미리보기 선도 새 좌표를 따라간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("구간 1 경사도").fill("1");
    const preview = page
      .locator(".leaflet-pane.slope-preview-pane path")
      .first();
    const before = await preview.getAttribute("d");
    const segmentCard = page.locator('label[for="slope-0"]').locator("..");
    const distanceBefore = await segmentCard
      .locator("span")
      .first()
      .textContent();

    const mapBox = (await map.boundingBox())!;
    const marker = page.locator(".marker-icon").first();
    const markerBox = (await marker.boundingBox())!;
    await page.mouse.move(
      markerBox.x + markerBox.width / 2,
      markerBox.y + markerBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(mapBox.x + 250, mapBox.y + 260, { steps: 10 });
    await page.mouse.up();

    await expect(preview).not.toHaveAttribute("d", before ?? "");
    // 드래그는 좌표만 바꾼다. 구간 거리 표시는 새 좌표로 다시 계산되어
    // 바뀌지만, 사용자가 입력한 경사값은 그대로 남아 있어야 한다(6.2절).
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("1");
    await expect(segmentCard.locator("span").first()).not.toHaveText(
      distanceBefore ?? "",
    );
  });

  test("저장이 실패해도 그린 경로와 입력값이 남는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    // 목 뒤에 얹으면 LIFO로 먼저 걸린다. slope_segments POST만 500으로 돌린다.
    await page.route("**/rest/v1/slope_segments*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "서버 오류" }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/admin/slopes/new");
    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("경로 이름").fill("실패 시험");
    await page.getByLabel("구간 1 경사도").fill("7.2");
    await page.getByRole("button", { name: "경로 저장" }).click();

    await expect(page.getByText(/저장 실패/)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/slopes\/new$/);
    await expect(page.getByLabel("경로 이름")).toHaveValue("실패 시험");
    await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");
  });

  test("값을 입력한 채 벗어나려 하면 경고한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });
    await page.getByLabel("경로 이름").fill("작성 중");

    // 편집기 하단의 취소 버튼. 모달이 뜨면 모달 안의 취소로 되돌아온다.
    await page.getByRole("button", { name: "취소" }).first().click();
    await expect(
      page.getByText("저장하지 않은 변경사항이 있어요"),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "취소" })
      .click();
    await expect(page.getByLabel("경로 이름")).toHaveValue("작성 중");
  });

  test("기존 수기 경로를 아무것도 고치지 않고 취소하면 경고 없이 나간다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/2");

    // 지도가 좌표를 다시 읽어 state에 새 배열을 써넣는 것까지 기다린다.
    const preview = page
      .locator(".leaflet-pane.slope-preview-pane path")
      .first();
    await expect(preview).toBeVisible();

    await page.getByRole("button", { name: "취소" }).click();

    await expect(page.getByText("저장하지 않은 변경사항이 있어요")).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
  });

  test("편집기에서 저장한 경로가 공개 지도에 그대로 그려진다", async ({
    page,
  }) => {
    // 이 설계 전체가 "toStoredSegments의 출력을 SlopeLayer가 그대로 읽는다"에
    // 걸려 있다. 픽스처가 아니라 실제 저장 payload로 끝단을 확인한다.
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 360, y: 150 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("경로 이름").fill("끝단 시험 경사로");
    await page.getByLabel("구간 1 경사도").fill("10");
    await page.getByRole("button", { name: "경로 저장" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

    await page.goto("/");
    await page.getByRole("checkbox", { name: "경사도" }).check();

    // 10°는 17.63%라 15% 초과 칸 #7A1414다(src/lib/slopeScale.ts).
    // 픽스처의 두 행(3° #DDC26A, 7.2° #AE3B1E)은 이 색이 아니라 방금 저장한 경로만 잡힌다.
    const saved = page.locator('path[stroke="#7A1414"]').first();
    await expect(saved).toBeVisible();

    await saved.dispatchEvent("click");
    const popup = page.locator(".leaflet-popup");
    await expect(popup).toContainText("끝단 시험 경사로");
    await expect(popup).toContainText("17.6%");
    await expect(popup).toContainText("10.0°");
  });

  test("편집기 지도는 19까지 확대된다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).not.toHaveClass(/leaflet-disabled/);
    await zoomIn.click();
    await expect(zoomIn).toHaveClass(/leaflet-disabled/);
  });

  test("선을 끝내면 구간마다 번호표가 뜬다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
      { x: 520, y: 260 },
    ];
    for (const position of points) await map.click({ position });
    await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);
    await map.click({ position: points[2] });

    const labels = page.locator(".ku-slope-segment-label");
    await expect(labels).toHaveCount(2);
    await expect(labels.nth(0)).toHaveText("1");
    await expect(labels.nth(1)).toHaveText("2");
  });

  test("그리기 도구 문구가 한국어다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    // 끝내기 문구는 그리기·이동 모드 두 컨테이너에 있어 그리기 쪽 액션으로 좁힌다.
    const finish = page.locator(".leaflet-pm-action.action-finish");
    await expect(finish).toHaveText("끝내기");
    await expect(finish).toBeVisible();
    await expect(
      page.locator(".leaflet-pm-actions-container").getByText("마지막 꼭지점 제거"),
    ).toBeVisible();
  });

  test("모바일 폭에서도 지도가 화면 폭을 쓴다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    // 페이지 좌우 패딩 24px을 빼면 327px다. 2열 그리드일 때는 47px이었다.
    const box = await page.locator(".leaflet-container").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(320);
  });

  test("퍼센트로 입력하면 도로 바꿔 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    await page.getByLabel("경로 이름").fill("퍼센트 입력 시험");
    await page.getByRole("radio", { name: "퍼센트(%)" }).check();
    await page.getByLabel("구간 1 경사도").fill("12.5");
    await page.getByRole("button", { name: "경로 저장" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

    const saved = state.slopes[state.slopes.length - 1];
    const segments = saved.segments as Array<Record<string, unknown>>;
    // atan(0.125) = 7.12501634890…°. 반올림 없이 저장한다(설계 2.2).
    expect(segments[1].slope as number).toBeCloseTo(7.1250163489, 9);
  });

  test("다른 단위 환산값을 보여주고 단위를 바꿔도 값이 유지된다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");

    const map = page.locator(".leaflet-container");
    await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
    const points = [
      { x: 300, y: 120 },
      { x: 420, y: 180 },
    ];
    for (const position of points) await map.click({ position });
    await map.click({ position: points[1] });

    const input = page.getByLabel("구간 1 경사도");
    await input.fill("10");
    await expect(page.getByText("= 17.6%")).toBeVisible();

    await page.getByRole("radio", { name: "퍼센트(%)" }).check();
    await expect(input).toHaveValue("17.63");
    await expect(page.getByText("= 10.0°")).toBeVisible();

    await page.getByRole("radio", { name: "도(°)" }).check();
    await expect(input).toHaveValue("10");
  });

  test("고른 입력 단위를 기억한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/slopes/new");
    await page.getByRole("radio", { name: "퍼센트(%)" }).check();

    await page.reload();
    await expect(page.getByRole("radio", { name: "퍼센트(%)" })).toBeChecked();
  });

  const NEAR_CENTER = { latitude: 37.5893, longitude: 127.034 };
  const blueDot = (page: import("@playwright/test").Page) =>
    page.locator('.leaflet-container path[fill="#2563EB"]');

  async function dotOffsetFromCenter(page: import("@playwright/test").Page) {
    const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
    const dotBox = (await blueDot(page).boundingBox())!;
    return {
      x: dotBox.x + dotBox.width / 2 - (mapBox.x + mapBox.width / 2),
      y: dotBox.y + dotBox.height / 2 - (mapBox.y + mapBox.height / 2),
    };
  }

  test("새 경로는 받은 위치를 가운데 두고 파란 점을 찍는다", async ({
    page,
  }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
    });
    await page.goto("/admin/slopes/new");

    await expect(blueDot(page)).toHaveCount(1);
    const offset = await dotOffsetFromCenter(page);
    expect(Math.abs(offset.x)).toBeLessThan(3);
    expect(Math.abs(offset.y)).toBeLessThan(3);
  });

  test("위치 권한이 없으면 점 없이 기본 위치로 연다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: null,
    });
    await page.goto("/admin/slopes/new");
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });

  test("캠퍼스 밖 위치는 쓰지 않는다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: { latitude: 37.5, longitude: 127.0 },
    });
    await page.goto("/admin/slopes/new");
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });

  test("위치 응답 전에 지도를 끌면 화면을 옮기지 않는다", async ({ page }) => {
    // 지연이 짧으면 드래그가 응답보다 늦게 끝나도 통과해 버려 결함을 못 잡는다.
    // 3초면 드래그가 먼저 끝나고, 응답은 expect 기본 대기(5초) 안에 온다.
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
      geolocationDelayMs: 3000,
    });
    await page.goto("/admin/slopes/new");

    const box = (await page.locator(".leaflet-container").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, {
      steps: 5,
    });
    await page.mouse.up();

    await expect(blueDot(page)).toHaveCount(1);
    const offset = await dotOffsetFromCenter(page);
    expect(Math.abs(offset.x)).toBeGreaterThan(30);
  });

  test("기존 경로 수정은 위치가 아니라 선에 맞춰 연다", async ({ page }) => {
    await installMockBackend(page, {
      authenticated: true,
      currentLocation: NEAR_CENTER,
    });
    await page.goto("/admin/slopes/2");
    await expect(
      page.locator(".leaflet-pane.slope-preview-pane path").first(),
    ).toBeVisible();
    await expect(blueDot(page)).toHaveCount(0);
  });
});
