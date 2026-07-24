import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("모달 초점 관리와 토스트 라이브 영역", () => {
  test("시설 모달이 초점을 가두고 닫힌 뒤 실행 버튼으로 돌려보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");

    const trigger = page.getByRole("button", { name: "+ 시설 추가" });
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "시설 추가" });
    const firstControl = dialog.locator("select");
    const lastControl = dialog.getByRole("button", { name: "저장" });
    await expect(firstControl).toBeFocused();

    await lastControl.focus();
    await page.keyboard.press("Tab");
    await expect(firstControl).toBeFocused();

    await firstControl.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(lastControl).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("중첩 확인 모달만 먼저 닫고 바깥 영상 모달의 초점을 복원한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) facility.video_url = "https://cdn.test/video.mp4";
    await page.goto("/admin/dashboard/facilities");

    const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
    const trigger = row.getByRole("button", { name: "동영상" });
    await trigger.focus();
    await trigger.click();

    const videoDialog = page.getByRole("dialog", { name: "동영상 관리" });
    const deleteButton = videoDialog.getByRole("button", {
      name: "동영상 삭제",
    });
    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", {
      name: "동영상을 삭제할까요?",
    });
    await expect(
      confirmDialog.getByRole("button", { name: "취소" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmDialog).toHaveCount(0);
    await expect(videoDialog).toBeVisible();
    await expect(deleteButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(videoDialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("관리자 설정과 명소 모달도 Escape 후 실행 버튼으로 복귀한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    const landmarkTrigger = page.getByRole("button", { name: "+ 명소 추가" });
    await landmarkTrigger.focus();
    await landmarkTrigger.click();
    const landmarkDialog = page.getByRole("dialog", { name: "명소 추가" });
    await expect(landmarkDialog.getByPlaceholder("예: 다람쥐길")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(landmarkDialog).toHaveCount(0);
    await expect(landmarkTrigger).toBeFocused();

    const settingsTrigger = page.getByRole("button", { name: "설정" });
    await settingsTrigger.focus();
    await settingsTrigger.click();
    const settingsDialog = page.getByRole("dialog", {
      name: "피드백 이메일 변경",
    });
    const firstInput = settingsDialog.locator("input").first();
    const saveButton = settingsDialog.getByRole("button", { name: "저장" });
    await expect(firstInput).toBeFocused();
    await firstInput.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(saveButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(settingsDialog).toHaveCount(0);
    await expect(settingsTrigger).toBeFocused();
  });

  test("공개 피드백 모달이 초점을 관리하고 실행 버튼으로 복귀한다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "피드백 보내기" });
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "피드백 보내기" });
    const content = dialog.getByLabel("내용");
    const submit = dialog.getByRole("button", { name: "제출하기" });
    await expect(content).toBeFocused();

    await content.fill("접근성 테스트 피드백");
    await submit.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("오류와 성공 토스트를 각각 alert와 status로 전달한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/new");

    await page.getByRole("button", { name: "건물 저장" }).click();
    const errorToast = page.locator(".ku-toast[role='alert']");
    await expect(errorToast).toContainText("건물 이름을 입력해주세요");
    await expect(
      errorToast.getByRole("button", { name: "알림 닫기" }),
    ).toBeVisible();
    await errorToast.getByRole("button", { name: "알림 닫기" }).click();

    await page.goto("/admin/dashboard/facilities");
    const row = page.getByText("중앙광장 경사로").locator("xpath=../..");
    await row.getByRole("button", { name: "미설치로 변경" }).click();
    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "미설치로 변경되었어요" }),
    ).toBeVisible();
  });
});
