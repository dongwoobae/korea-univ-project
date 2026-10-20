"use client";

import { useId, useRef } from "react";
import LevelBadge from "@/components/admin/logs/LevelBadge";
import {
  actionLabel,
  changeLines,
  changeVerb,
  formatLogTime,
  recordedLate,
  targetText,
  type ActivityLogRow,
} from "@/lib/activityLabels";
import { useModalFocus } from "@/lib/useModalFocus";

/** 설계: docs/specs/2026-10-19-activity-log-design.md 5.4 */
export default function ActivityLogDetailModal({
  row,
  onClose,
}: {
  row: ActivityLogRow;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  });
  const failure = row.kind === "failure";
  const verb = failure ? `${actionLabel(row.action)} 실패` : changeVerb(row);
  const lines = failure ? [] : changeLines(row);

  return (
    <div
      ref={dialogRef}
      className="ku-log-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="ku-facility-modal ku-log-modal">
        <div className="ku-log-modal-title">
          <h2 id={titleId}>{targetText(row)}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="ku-admin-button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <dl className="ku-log-meta">
          <dt>시각</dt>
          <dd>{formatLogTime(row.occurred_at)}</dd>
          {recordedLate(row) && (
            <>
              <dt>기록된 시각</dt>
              <dd>{formatLogTime(row.recorded_at)}</dd>
            </>
          )}
          <dt>로그 유형</dt>
          <dd>
            <LevelBadge level={row.level} />
          </dd>
          <dt>사람</dt>
          <dd>{row.actor_label}</dd>
          <dt>동작</dt>
          <dd>{verb}</dd>
        </dl>

        {failure ? (
          <>
            <p className="ku-log-reason">{row.message}</p>
            <p className="ku-log-reason-code">사유 코드: {row.reason_code}</p>
            <details className="ku-log-raw">
              <summary>원문(개발자용)</summary>
              <pre>{JSON.stringify(row.detail ?? {}, null, 2)}</pre>
            </details>
          </>
        ) : lines.length === 0 ? null : (
          <table className="ku-log-changes">
            <thead>
              <tr>
                <th scope="col">칸</th>
                {row.action === "update" ? (
                  <>
                    <th scope="col">이전</th>
                    <th scope="col">이후</th>
                  </>
                ) : (
                  <th scope="col">
                    {row.action === "delete" ? "지워진 값" : "값"}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.column}>
                  <th scope="row">{line.label}</th>
                  {line.kind === "diff" ? (
                    <>
                      <td>{line.before}</td>
                      <td>{line.after}</td>
                    </>
                  ) : (
                    <td>{line.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
