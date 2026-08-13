import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

const JSON_HEADERS = { "access-control-allow-origin": "*" };

async function openLibraryPanel(page: import("@playwright/test").Page) {
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();
  await expect(page.locator(".ku-side-panel")).toBeVisible();
}

test.describe("공개 지도 P1 잔여 개선", () => {
  test("P1-06 시설 영상에 접근 이름과 자막 텍스트가 있다", async ({ page }) => {
    await installMockBackend(page);
    // 중앙도서관(건물 id 1) 시설 조회에 영상 URL과 자막을 주입한다.
    await page.route("**/rest/v1/building_facilities*", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.searchParams.get("building_id") !== "eq.1"
      ) {
        return route.fallback();
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: JSON_HEADERS,
        body: JSON.stringify([
          {
            id: "f-building",
            building_id: 1,
            facility_code: "elevator",
            name: "중앙 엘리베이터",
            name_en: "Central Elevator",
            is_installed: true,
            floor_info: "1층",
            video_url: "https://cdn.test/video.mp4",
            video_caption: "엘리베이터 이용 방법 자막 설명",
            facility_types: {
              code: "elevator",
              label: "엘리베이터",
            },
          },
        ]),
      });
    });
    await page.goto("/");
    await openLibraryPanel(page);

    const video = page.locator(".ku-facility-video video");
    await expect(video).toHaveAttribute("aria-label", "중앙 엘리베이터 영상");
    await expect(
      page.getByText("엘리베이터 이용 방법 자막 설명"),
    ).toBeVisible();
  });

  test("P1-05 손잡이를 탭하면 상세 패널이 닫힌다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await page.goto("/");
    await openLibraryPanel(page);

    const handle = page.locator(".ku-side-handle");
    await expect(handle).toHaveAttribute("aria-label", "닫기");
    await handle.click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
  });

  test("P1-05 손잡이를 아래로 스와이프하면 상세 패널이 닫힌다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await page.goto("/");
    await openLibraryPanel(page);

    // 손잡이에서 아래로 임계값(80px) 이상 스와이프
    await page.locator(".ku-side-handle").evaluate((el) => {
      const fire = (type: string, y: number) => {
        const touch = new Touch({
          identifier: 1,
          target: el,
          clientX: 195,
          clientY: y,
        });
        el.dispatchEvent(
          new TouchEvent(type, {
            touches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      fire("touchstart", 700);
      fire("touchmove", 780);
      fire("touchmove", 860);
      fire("touchend", 860);
    });

    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
  });

  test("P1-07 음성 인식 실패를 토스트로 구분해 안내한다", async ({ page }) => {
    await installMockBackend(page);
    // 시작 직후 no-speech 오류를 던지는 가짜 인식기 주입(mock이 지운 뒤 재정의)
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        start() {
          this.onstart?.();
          setTimeout(() => {
            this.onerror?.({ error: "no-speech" });
            this.onend?.();
          }, 0);
        }
        stop() {}
      }
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        FakeRecognition;
    });
    await page.goto("/");

    await page.getByTitle("음성 검색").click();
    await expect(
      page.getByText("음성을 인식하지 못했어요. 다시 시도해 주세요"),
    ).toBeVisible();
  });

  test("P1-07 마이크 권한 거부를 토스트로 안내한다", async ({ page }) => {
    await installMockBackend(page);
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        start() {
          this.onstart?.();
          setTimeout(() => {
            this.onerror?.({ error: "not-allowed" });
            this.onend?.();
          }, 0);
        }
        stop() {}
      }
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        FakeRecognition;
    });
    await page.goto("/");

    await page.getByTitle("음성 검색").click();
    await expect(page.getByText("마이크 권한이 거부되었어요")).toBeVisible();
  });
});
