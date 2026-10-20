import { after } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ActionKey, AuditTable } from "@/lib/activityLabels";
import {
  classifyFailure,
  failureLevel,
  type ReasonCode,
} from "@/lib/failureReason";
import { findListedAdmin } from "@/lib/server/adminUsers";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

/** 서버 실패 기록. 설계: docs/specs/2026-10-19-activity-log-design.md 4.2 */

export type LogActor =
  | { kind: "admin"; user: Pick<User, "id" | "email"> }
  | { kind: "visitor" }
  | { kind: "system"; system: "translation" | "osm_sync" };

export type FailureTarget = {
  table: AuditTable;
  id?: string | null;
  label?: string | null;
};

export type FailureLogInput = {
  route: string;
  action: ActionKey;
  actor: LogActor;
  reason: ReasonCode;
  status?: number;
  error?: unknown;
  followUp?: boolean;
  target?: FailureTarget;
  reasonText?: string;
  fileSize?: number;
  fileType?: string;
  limit?: number;
};

const SYSTEM_LABELS = {
  translation: "자동 번역",
  osm_sync: "OSM 동기화",
} as const;

async function actorColumns(actor: LogActor) {
  if (actor.kind === "visitor")
    return { actor_kind: "visitor", actor_id: null, actor_label: "방문자" };
  if (actor.kind === "system")
    return {
      actor_kind: "system",
      actor_id: null,
      actor_label: SYSTEM_LABELS[actor.system],
    };
  const fallback = actor.user.email ?? actor.user.id;
  const listed = await findListedAdmin(actor.user.id).then(
    (admin) => admin?.displayName ?? `미등록 계정(${fallback})`,
    () => `관리자(이름 확인 실패: ${fallback})`,
  );
  return { actor_kind: "admin", actor_id: actor.user.id, actor_label: listed };
}

export async function writeFailure(input: FailureLogInput): Promise<void> {
  try {
    const { reason_code, message, detail } = classifyFailure(
      {
        kind: "known",
        reason: input.reason,
        status: input.status,
        error: input.error,
      },
      {
        action: input.action,
        route: input.route,
        reasonText: input.reasonText,
        fileSize: input.fileSize,
        fileType: input.fileType,
        limit: input.limit,
      },
    );
    const { error } = await supabaseAdmin()
      .from("activity_logs")
      .insert({
        level: failureLevel(reason_code, input.followUp),
        kind: "failure",
        ...(await actorColumns(input.actor)),
        action: input.action,
        target_table: input.target?.table ?? null,
        target_id: input.target?.id ?? null,
        target_label: input.target?.label ?? null,
        reason_code,
        message,
        detail,
      });
    if (error) throw error;
  } catch (error) {
    console.error("[activity-log] failure log write failed", {
      route: input.route,
      action: input.action,
      reason: input.reason,
      message:
        error instanceof Error
          ? error.message
          : (error as { message?: unknown } | null)?.message,
    });
  }
}

/** 응답을 기다리게 하지 않는다. `after`를 못 쓰는 곳(요청 범위 밖)에서는 바로 쓴다. */
export function logFailure(input: FailureLogInput): void {
  try {
    after(() => writeFailure(input));
  } catch {
    void writeFailure(input);
  }
}
