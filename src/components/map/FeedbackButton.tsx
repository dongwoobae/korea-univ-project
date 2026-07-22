"use client";

import { useEffect, useState } from "react";
import { FEEDBACK_EMAILS_FALLBACK, getSetting } from "@/lib/settings";

const FEEDBACK_TYPES = ["오류 제보", "시설 정보 수정", "기능 제안", "기타"];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState(FEEDBACK_EMAILS_FALLBACK);
  const [type, setType] = useState(FEEDBACK_TYPES[0]);
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled && value) setEmails(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function sendFeedback() {
    const params = new URLSearchParams({
      subject: `${emails.subject} · ${type}`,
      body: `유형: ${type}\n\n내용:\n${content.trim()}\n\n페이지: ${window.location.href}`,
    });
    if (emails.cc.length > 0) params.set("cc", emails.cc.join(","));
    window.location.href = `mailto:${emails.to}?${params.toString()}`;
    setOpen(false);
  }

  return (
    <>
      <button
        className="ku-map-action ku-map-action--primary"
        type="button"
        onClick={() => setOpen(true)}
        title="피드백 보내기"
        aria-label="피드백 보내기"
      >
        <span aria-hidden="true">💬</span>
      </button>

      {open && (
        <div
          className="ku-feedback-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
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
              >
                ✕
              </button>
            </div>
            <p className="ku-feedback-help">
              발견한 오류나 필요한 접근성 정보를 알려주세요. 메일 앱에서 내용을
              확인한 뒤 전송할 수 있습니다.
            </p>
            <span className="ku-feedback-label">유형</span>
            <div className="ku-feedback-types">
              {FEEDBACK_TYPES.map((item) => (
                <button
                  className="ku-chip"
                  type="button"
                  key={item}
                  data-active={type === item}
                  onClick={() => setType(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="ku-feedback-label" htmlFor="feedback-content">
              내용
            </label>
            <textarea
              className="ku-feedback-textarea"
              id="feedback-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="어떤 점을 개선하면 좋을지 적어주세요."
              autoFocus
            />
            <div className="ku-feedback-actions">
              <button
                className="ku-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                className="ku-button ku-button--primary"
                type="button"
                onClick={sendFeedback}
                disabled={!content.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
