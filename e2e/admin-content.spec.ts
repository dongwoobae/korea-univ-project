import path from "node:path";
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 업로드 전 재생 가능 여부 검사(isVideoPlayable)를 통과해야 변환 없이 업로드로
// 진행되므로, 더미 바이트가 아닌 실제 H.264 파일을 올린다.
const PLAYABLE_VIDEO = path.join(__dirname, "fixtures/tiny-h264.mp4");

test.describe("독립 시설과 명소 관리자 CRUD", () => {
  test("독립 시설을 검색·필터·정렬하고 조건을 초기화한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/facilities");

    await expect(
      page.getByRole("status", { name: "총 2개 중 현재 2개 표시" }),
    ).toBeVisible();
    // 유형별 클래스까지 봐야 모든 행이 폴백 아이콘으로 떨어지는 회귀를 잡는다.
    const rampRow = page.getByText("중앙광장 경사로").locator("xpath=../..");
    await expect(rampRow.locator("svg.lucide-trending-up")).toHaveCount(1);
    const parkingRow = page
      .getByText("공사 중 주차구역")
      .locator("xpath=../..");
    await expect(parkingRow.locator("svg.lucide-square-parking")).toHaveCount(
      1,
    );

    await page.getByRole("searchbox", { name: "독립 시설 검색" }).fill("공사");
    await expect(page.getByText("공사 중 주차구역")).toBeVisible();
    await expect(page.getByText("중앙광장 경사로")).toHaveCount(0);

    await page.getByLabel("설치 상태 필터").selectOption("installed");
    await expect(
      page.getByText("조건에 맞는 독립 시설이 없어요"),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "총 0개 중 현재 0개 표시" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await page.getByLabel("독립 시설 정렬").selectOption("name");
    await expect(page.getByTestId("admin-list-item-name")).toHaveText([
      "공사 중 주차구역",
      "중앙광장 경사로",
    ]);

    await page.getByLabel("시설 유형 필터").selectOption("ramp");
    await expect(page.getByText("중앙광장 경사로")).toBeVisible();
    await expect(page.getByText("공사 중 주차구역")).toHaveCount(0);
  });

  test("독립 시설을 현재 위치에 생성하고 상태 변경 후 삭제한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption("ramp");
    await dialog.getByPlaceholder("예: 정문 엘리베이터").fill("E2E 경사로");
    await dialog.getByTitle("현재 위치로 이동").click();
    await expect(dialog.getByText(/선택된 위치:/)).toBeVisible();
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("E2E 경사로")).toBeVisible();
    expect(
      state.facilities.some((facility) => facility.name === "E2E 경사로"),
    ).toBeTruthy();

    const row = page.getByText("E2E 경사로").locator("xpath=../..");
    await expect(
      row.getByRole("status", { name: "현재 상태: 설치" }),
    ).toBeVisible();
    await row.getByRole("button", { name: "미설치로 변경" }).click();
    await expect(
      row.getByRole("status", { name: "현재 상태: 미설치" }),
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "설치로 변경" }),
    ).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "E2E 경사로")
        ?.is_installed,
    ).toBe(false);

    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByText("시설을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText("E2E 경사로")).toHaveCount(0);
  });

  test("시설 저장과 자동 번역 실패를 분리하고 재번역한다", async ({ page }) => {
    const state = await installMockBackend(page, {
      authenticated: true,
      failTranslations: 1,
    });
    await page.goto("/admin/dashboard/facilities");

    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption("ramp");
    await dialog
      .getByPlaceholder("예: 정문 엘리베이터")
      .fill("번역 실패 경사로");
    await dialog.getByTitle("현재 위치로 이동").click();
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(
      page.getByText(
        "시설은 저장했지만 자동 번역에 실패했어요. 목록에서 재번역해 주세요.",
      ),
    ).toBeVisible();
    const row = page.getByText("번역 실패 경사로").locator("xpath=../..");
    await expect(
      row.getByRole("status", { name: "번역 상태: 번역 필요" }),
    ).toBeVisible();
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.translation_status,
    ).toBe("failed");

    await row.getByRole("button", { name: "재번역" }).click();
    await expect(page.getByText("시설 번역을 완료했어요")).toBeVisible();
    await expect(
      row.getByRole("status", { name: "번역 상태: 번역 필요" }),
    ).toHaveCount(0);
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.name_en,
    ).toBe("EN 번역 실패 경사로");
    expect(
      state.facilities.find((facility) => facility.name === "번역 실패 경사로")
        ?.translation_status,
    ).toBe("translated");
  });

  test("시설 동영상을 업로드하고 캡션 저장 후 삭제한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
    await row.getByRole("button", { name: "동영상" }).click();
    await expect(page.getByText("동영상 관리")).toBeVisible();

    await page
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles(PLAYABLE_VIDEO);
    await expect(page.locator("video")).toBeVisible();

    const caption = page.getByPlaceholder("동영상 설명 추가...");
    await caption.fill("정문 방향 경사로 영상");
    await caption.blur();
    await expect
      .poll(
        () =>
          state.facilities.find((facility) => facility.id === "f-installed")
            ?.video_caption,
      )
      .toBe("정문 방향 경사로 영상");

    await page.getByRole("button", { name: "동영상 삭제" }).click();
    await page.getByText("동영상을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText(/동영상 추가/)).toBeVisible();
  });

  test("사진을 선택한 신규 명소를 한 번에 저장하고 삭제한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("button", { name: "+ 명소 추가" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("예: 다람쥐길").fill("E2E 포토존");
    await dialog.getByPlaceholder("명소 설명").fill("학생회관 앞 포토존");
    // 이모지 입력란은 lucide 전환으로 사라졌다. 남아 있으면 필수 검증이
    // 되살아나 저장이 막히므로 없다는 것을 회귀로 잡는다.
    await expect(dialog.getByLabel("이모지 *")).toHaveCount(0);
    await dialog.getByTitle("현재 위치로 이동").click();
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "photo.webp",
      mimeType: "image/webp",
      buffer: Buffer.from("fake image"),
    });
    await expect(dialog.getByText("저장 시 업로드: photo.webp")).toBeVisible();
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("E2E 포토존")).toBeVisible();
    await expect(page.getByText("사진 있음").last()).toBeVisible();
    expect(
      state.landmarks.find((landmark) => landmark.name === "E2E 포토존")
        ?.photo_url,
    ).toContain("uploaded-landmark");

    const row = page.getByText("E2E 포토존").locator("xpath=../..");
    await row.getByRole("button", { name: "삭제" }).click();
    await page.getByText("명소를 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();
    await expect(page.getByText("E2E 포토존")).toHaveCount(0);
  });

  test("명소를 검색하고 사진 유무로 필터링한다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("searchbox", { name: "명소 검색" }).fill("Squirrel");
    await expect(page.getByText("다람쥐길")).toBeVisible();
    await page.getByLabel("명소 사진 필터").selectOption("without-photo");
    await expect(page.getByText("조건에 맞는 명소가 없어요")).toBeVisible();
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.getByText("다람쥐길")).toBeVisible();
  });

  test("명소를 서버 페이지 단위로 조회하고 모바일에서 이동한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.landmarks.push(
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `landmark-${index + 2}`,
        name: `추가 명소 ${String(index + 1).padStart(2, "0")}`,
        name_en: `Extra landmark ${index + 1}`,
        description: "페이지네이션 검증용 명소",
        lat: 37.5895,
        lng: 127.0322,
        photo_url: null,
        created_at: "2026-07-21T00:00:00Z",
        updated_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      })),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/landmarks");

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
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
    await page.getByRole("button", { name: "이전" }).click();
    await expect(
      page.getByRole("button", { name: "1 페이지" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
