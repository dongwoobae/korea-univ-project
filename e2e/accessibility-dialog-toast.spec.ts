import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("모달 초점 관리와 토스트 라이브 영역", () => {
  test("시설 모달이 초점을 가두고 닫힌 뒤 실행 버튼으로 돌려보낸다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

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

  test("관리자 설정 모달도 Escape 후 실행 버튼으로 복귀한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

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

  // 패널은 모달이 아니다. 피커는 useModalFocus의 dialogStack에 자기를 얹어 Escape를 맡고,
  // 패널에는 Escape로 닫히는 동작이 없다.
  test("명소 패널의 이모지 피커 Escape는 피커만 닫고 입력과 초점을 남긴다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");

    await page.getByRole("button", { name: "＋ 명소 추가" }).click();
    const panel = page.getByRole("region", { name: "명소 추가", exact: true });
    await panel.getByPlaceholder("예: 다람쥐길").fill("Escape 시험 명소");

    const iconButton = panel.getByRole("button", { name: /이모지/ });
    await iconButton.click();
    const search = panel.getByLabel("이모지 검색");
    await expect(search).toBeFocused();
    await expect(iconButton).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");

    await expect(search).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(iconButton).toHaveAttribute("aria-expanded", "false");
    await expect(iconButton).toBeFocused();
    await expect(panel.getByPlaceholder("예: 다람쥐길")).toHaveValue(
      "Escape 시험 명소",
    );

    // 피커가 닫힌 뒤의 Escape는 패널을 닫지 않는다.
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
  });

  test("명소 패널 입력의 레이블이 프로그램적으로 연결된다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/landmarks");
    await page
      .getByRole("region", { name: "명소", exact: true })
      .getByRole("button", { name: /다람쥐길/ })
      .click();
    const panel = page.getByRole("region", { name: "다람쥐길", exact: true });

    await expect(panel.getByLabel("이름 *")).toBeEditable();
    await expect(panel.getByLabel("설명", { exact: true })).toBeEditable();
    await expect(panel.getByRole("button", { name: /이모지/ })).toBeVisible();
    await panel.getByRole("button", { name: "직접 고치기" }).click();
    await expect(panel.getByLabel("영문 이름")).toBeEditable();
    await expect(panel.getByLabel("중문 이름")).toBeEditable();
    await expect(panel.getByLabel("영문 설명")).toBeEditable();
    await expect(panel.getByLabel("중문 설명")).toBeEditable();
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

  test("중첩 확인 모달만 먼저 닫고 바깥 영상 모달의 초점을 복원한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) facility.video_url = "https://cdn.test/video.mp4";
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    const trigger = page
      .getByRole("region", { name: "중앙광장 경사로", exact: true })
      .getByRole("button", { name: "교체" });
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

  test("동영상 삭제 성공 시 실행 버튼이 사라져도 초점이 남은 모달 안으로 복귀한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) facility.video_url = "https://cdn.test/video.mp4";
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    await page
      .getByRole("region", { name: "중앙광장 경사로", exact: true })
      .getByRole("button", { name: "교체" })
      .click();

    const videoDialog = page.getByRole("dialog", { name: "동영상 관리" });
    const deleteButton = videoDialog.getByRole("button", {
      name: "동영상 삭제",
    });
    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", {
      name: "동영상을 삭제할까요?",
    });
    await confirmDialog.getByRole("button", { name: "삭제" }).click();

    await expect(confirmDialog).toHaveCount(0);
    await expect(deleteButton).toHaveCount(0);
    await expect(videoDialog).toBeVisible();
    await expect
      .poll(() =>
        videoDialog.evaluate((el) => el.contains(document.activeElement)),
      )
      .toBe(true);
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

    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "미설치로 변경" })
      .click();
    await expect(
      page
        .locator(".ku-toast[role='status']")
        .filter({ hasText: "미설치로 변경되었어요" }),
    ).toBeVisible();
  });

  test("로그인 폼 레이블이 연결되고 오류를 alert로 알린다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/admin");

    const emailInput = page.getByLabel("이메일");
    const passwordInput = page.getByLabel("비밀번호");
    await emailInput.fill("wrong@example.com");
    await passwordInput.fill("wrong-password");
    await page.getByRole("button", { name: "로그인", exact: true }).click();

    const alert = page.locator("#admin-login-error");
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert).toContainText("이메일 또는 비밀번호가 올바르지 않아요");
    await expect(emailInput).toHaveAttribute(
      "aria-describedby",
      "admin-login-error",
    );
    await expect(passwordInput).toHaveAttribute(
      "aria-describedby",
      "admin-login-error",
    );
  });

  test("관리자 모달 폼 레이블이 입력과 프로그램적으로 연결된다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });

    await page.goto("/admin/buildings/1");
    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    const facilityDialog = page.getByRole("dialog", { name: "시설 추가" });
    await expect(facilityDialog.getByLabel("시설 유형 *")).toBeVisible();
    await expect(facilityDialog.getByLabel("시설 이름 (선택)")).toBeEditable();
    await expect(facilityDialog.getByLabel("설명 (선택)")).toBeEditable();
    await page.keyboard.press("Escape");
    await page.goto("/admin/dashboard/buildings");

    const settingsTrigger = page.getByRole("button", { name: "설정" });
    await settingsTrigger.click();
    const settingsDialog = page.getByRole("dialog", {
      name: "피드백 이메일 변경",
    });
    await expect(settingsDialog.getByLabel("수신")).toBeEditable();
    await expect(
      settingsDialog.getByLabel("참조 1", { exact: true }),
    ).toBeEditable();
    await expect(settingsDialog.getByLabel("제목")).toBeEditable();
    await page.keyboard.press("Escape");
  });

  test("모바일 독립 시설 상세의 버튼이 44px 터치 영역을 확보한다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    const facility = state.facilities.find((item) => item.id === "f-installed");
    if (facility) {
      facility.translation_status = "failed";
      facility.video_url = "https://cdn.test/video.mp4";
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard/facilities?id=f-installed");

    const detail = page.getByRole("region", {
      name: "중앙광장 경사로",
      exact: true,
    });
    for (const name of [
      "목록으로",
      "설치",
      "미설치",
      "재번역",
      "현 위치로 찍기",
      "교체",
      "삭제",
      "취소",
      "저장",
    ]) {
      const button = detail.getByRole("button", { name, exact: true });
      await expect(button, name).toBeVisible();
      const box = await button.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("모바일 명소 상세의 버튼이 44px 터치 영역을 확보한다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      "/admin/dashboard/landmarks?id=11111111-1111-1111-1111-111111111111",
    );

    const detail = page.getByRole("region", { name: "다람쥐길", exact: true });
    for (const name of [
      "목록으로",
      /^이모지 .+ 바꾸기$/,
      "사진 변경",
      "사진 삭제",
      "자동번역 채우기",
      "설명 보기",
      "직접 고치기",
      "지도에서 위치 고르기",
      "삭제",
      "취소",
      "저장",
    ]) {
      const label = String(name);
      const button = detail.getByRole("button", {
        name,
        exact: typeof name === "string",
      });
      await expect(button, label).toBeVisible();
      const box = await button.boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.width, label).toBeGreaterThanOrEqual(44);
      expect(box!.height, label).toBeGreaterThanOrEqual(44);
    }
  });
});
