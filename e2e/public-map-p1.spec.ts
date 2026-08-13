import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const MOBILE = { width: 390, height: 844 };

test.describe("공개 지도 P1 개선 (현재 위치·필터 배지·라벨)", () => {
  test("P1-02: 현재 위치 요청 성공 시 마커와 정확도 원을 표시한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    // 성공 콜백이 경계 내부 좌표(정확도 30m)로 발화하도록 geolocation을 덮어쓴다
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: 37.589,
                longitude: 127.032,
                accuracy: 30,
              },
            } as GeolocationPosition);
          },
        },
      });
    });
    await page.goto("/");

    await page.getByRole("button", { name: "현 위치" }).click();

    // 사용자 위치 마커(divIcon 점)가 보인다
    await expect(page.locator(".ku-user-location-dot")).toBeVisible();
    // 정확도 원(파란 leaflet path)이 오버레이 페인에 그려진다
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#2563eb"]'),
    ).toHaveCount(1);
  });

  test("P1-02: 위치 권한 거부 시 오류 토스트를 띄우고 마커를 만들지 않는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(
            _success: PositionCallback,
            error: PositionErrorCallback,
          ) {
            error({
              code: 1,
              PERMISSION_DENIED: 1,
            } as GeolocationPositionError);
          },
        },
      });
    });
    await page.goto("/");

    await page.getByRole("button", { name: "현 위치" }).click();

    await expect(page.getByText("위치 권한이 거부되었어요")).toBeVisible();
    await expect(page.locator(".ku-user-location-dot")).toHaveCount(0);
  });

  test("P1-03: 모바일 필터 배지가 첫 로드에 0이며 명소를 끄면 1이 된다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    const badge = page.locator(".ku-mobile-filter-badge");
    await expect(badge).toHaveText("0"); // 회귀: 이전에는 1

    await page.locator(".ku-mobile-filter-trigger").click();
    await page.getByText("명소", { exact: true }).click();
    await expect(badge).toHaveText("1");
  });

  test("P1-01: 캠퍼스 필터 섹션 제목이 '캠퍼스 영역'으로 노출된다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");

    // 데스크톱에서는 필터 패널이 인라인으로 렌더링되어 제목이 바로 보인다
    await expect(page.getByText("캠퍼스 영역")).toBeVisible();
  });
});
