"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import {
  FEEDBACK_EMAILS_FALLBACK,
  getSetting,
  normalizeFeedbackEmails,
  type FeedbackEmails,
} from "@/lib/settings";
import { FEEDBACK_TYPES, type FeedbackType } from "@/lib/feedback";
import { useLanguage } from "@/lib/LanguageContext";
import { useModalFocus } from "@/lib/useModalFocus";

type SubmissionStatus =
  | { kind: "idle"; message: "" }
  | { kind: "submitting"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const IDLE_STATUS: SubmissionStatus = { kind: "idle", message: "" };

export default function FeedbackButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<FeedbackEmails>(
    FEEDBACK_EMAILS_FALLBACK,
  );
  const [type, setType] = useState<FeedbackType>(FEEDBACK_TYPES[0].value);
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>(IDLE_STATUS);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    active: open,
    onClose: () => setOpen(false),
    closeOnEscape: status.kind !== "submitting",
    initialFocusRef: contentRef,
  });

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled) setEmails(normalizeFeedbackEmails(value));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openDialog() {
    setStatus(IDLE_STATUS);
    setOpen(true);
  }

  function mailtoUrl() {
    const label =
      FEEDBACK_TYPES.find((item) => item.value === type)?.label ?? "기타";
    const params = new URLSearchParams({
      subject: `${emails.subject} · ${label}`,
      body: `유형: ${label}\n\n내용:\n${content.trim()}\n\n페이지: ${window.location.origin}${window.location.pathname}`,
    });
    if (emails.cc.length > 0) params.set("cc", emails.cc.join(","));
    return `mailto:${emails.to}?${params.toString()}`;
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim().length < 3 || status.kind === "submitting") return;

    setStatus({ kind: "submitting", message: "피드백을 제출하고 있습니다." });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          content,
          pageUrl: `${window.location.origin}${window.location.pathname}`,
          website,
        }),
      });
      if (!response.ok) throw new Error("Feedback submission failed");

      setContent("");
      setStatus({
        kind: "success",
        message: "피드백이 접수되었습니다. 알려주셔서 감사합니다.",
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "서버 제출에 실패했습니다. 잠시 후 다시 시도하거나 메일로 보내주세요.",
      });
    }
  }

  return (
    <>
      <button
        className="ku-map-action ku-map-action--primary ku-map-action--labeled"
        type="button"
        onClick={openDialog}
        title="피드백 보내기"
        aria-label="피드백 보내기"
      >
        <MessageSquare size={19} aria-hidden="true" />
        <span className="ku-map-action-label">{t("feedback")}</span>
      </button>

      {open && (
        <div
          className="ku-feedback-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              status.kind !== "submitting"
            ) {
              setOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            className="ku-feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="ku-feedback-header">
              <h2 className="ku-feedback-title" id="feedback-title">
                피드백 보내기
              </h2>
              <button
                className="ku-feedback-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                disabled={status.kind === "submitting"}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="ku-feedback-help">
              발견한 오류나 필요한 접근성 정보를 알려주세요. 서버로 바로
              접수되며, 원한다면 메일 앱으로도 보낼 수 있습니다.
            </p>

            {status.kind === "success" ? (
              <>
                <p className="ku-feedback-status" data-kind="success">
                  {status.message}
                </p>
                <div className="ku-feedback-actions">
                  <button
                    className="ku-button ku-button--primary"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    확인
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submitFeedback}>
                <span className="ku-feedback-label" id="feedback-type-label">
                  유형
                </span>
                <div
                  className="ku-feedback-types"
                  role="group"
                  aria-labelledby="feedback-type-label"
                >
                  {FEEDBACK_TYPES.map((item) => (
                    <button
                      className="ku-chip"
                      type="button"
                      key={item.value}
                      data-active={type === item.value}
                      onClick={() => setType(item.value)}
                      disabled={status.kind === "submitting"}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="ku-feedback-label" htmlFor="feedback-content">
                  내용
                </label>
                <textarea
                  ref={contentRef}
                  className="ku-feedback-textarea"
                  id="feedback-content"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    if (status.kind === "error") setStatus(IDLE_STATUS);
                  }}
                  placeholder="어떤 점을 개선하면 좋을지 적어주세요."
                  minLength={3}
                  maxLength={2000}
                  required
                  disabled={status.kind === "submitting"}
                />
                <div className="ku-feedback-honeypot" aria-hidden="true">
                  <label htmlFor="feedback-website">웹사이트</label>
                  <input
                    id="feedback-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </div>
                <p className="ku-feedback-privacy">
                  이름·연락처는 수집하지 않습니다. 작성 내용, 현재 페이지 주소와
                  제출 시각이 저장됩니다. 민감한 개인정보는 입력하지 마세요.
                </p>
                {status.message && (
                  <p
                    className="ku-feedback-status"
                    data-kind={status.kind}
                    role={status.kind === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {status.message}
                  </p>
                )}
                <div className="ku-feedback-actions">
                  <a
                    className="ku-button ku-button--link"
                    href={mailtoUrl()}
                    aria-label="메일 앱으로 피드백 보내기"
                  >
                    메일로 보내기
                  </a>
                  <button
                    className="ku-button ku-button--primary"
                    type="submit"
                    disabled={
                      content.trim().length < 3 || status.kind === "submitting"
                    }
                  >
                    {status.kind === "submitting" ? "제출 중…" : "제출하기"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
