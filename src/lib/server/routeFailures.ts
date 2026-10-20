import { NextResponse } from "next/server";
import type { ReasonCode } from "@/lib/failureReason";
import {
  logFailure,
  type FailureLogInput,
  type FailureTarget,
} from "@/lib/server/activityLog";

type Scope = Pick<
  FailureLogInput,
  "route" | "action" | "actor" | "followUp"
> & {
  target?: FailureTarget;
};
type Extra = Partial<
  Omit<FailureLogInput, "route" | "actor" | "reason" | "status">
>;

/**
 * 라우트 하나의 실패 기록 묶음. `respond`는 기록하고 `{ error }` 응답을 만든다. `record`는 응답을 바꾸지 않는
 * 실패(저장은 됐지만 뒤따르는 일이 실패한 경우)를 기록한다.
 */
export function routeFailures(scope: Scope) {
  let target = scope.target;
  return {
    setTarget(next: FailureTarget) {
      target = next;
    },
    respond(
      status: number,
      error: string,
      reason: ReasonCode,
      extra: Extra = {},
    ) {
      logFailure({
        ...scope,
        target,
        reasonText: error,
        ...extra,
        reason,
        status,
      });
      return NextResponse.json({ error }, { status });
    },
    record(reason: ReasonCode, extra: Extra & { status?: number } = {}) {
      logFailure({ ...scope, target, ...extra, reason });
    },
  };
}
