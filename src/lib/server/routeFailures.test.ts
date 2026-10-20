import { beforeEach, describe, expect, it, vi } from "vitest";

const logFailure = vi.fn();
vi.mock("@/lib/server/activityLog", () => ({ logFailure }));

const scope = {
  route: "/api/delete-facility-photo",
  action: "facility_photo.delete",
  actor: { kind: "admin", user: { id: "u1", email: "admin@example.com" } },
} as const;

describe("routeFailures", () => {
  beforeEach(() => {
    logFailure.mockClear();
  });

  it("respond는 기록하고 { error } 응답을 만든다", async () => {
    const { routeFailures } = await import("./routeFailures");
    const failures = routeFailures(scope);
    failures.setTarget({ table: "facility_photos", id: "p1" });
    const response = failures.respond(404, "사진이 없어요", "not_found");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "사진이 없어요" });
    expect(logFailure).toHaveBeenCalledWith({
      ...scope,
      target: { table: "facility_photos", id: "p1" },
      reasonText: "사진이 없어요",
      reason: "not_found",
      status: 404,
    });
  });

  it("record는 응답 없이 기록하고 작업 키를 바꿀 수 있다", async () => {
    const { routeFailures } = await import("./routeFailures");
    routeFailures(scope).record("storage_error", {
      action: "facility_request.cleanup",
      followUp: true,
    });
    expect(logFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "facility_request.cleanup",
        followUp: true,
        reason: "storage_error",
      }),
    );
  });
});
