"use client";
import { useEffect, useState } from "react";
import { FEEDBACK_EMAILS_FALLBACK, getSetting } from "@/lib/settings";

export default function FeedbackButton({ isMobile }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [emails, setEmails] = useState(FEEDBACK_EMAILS_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled && value) setEmails(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      onMouseEnter={() => setShowFeedback(true)}
      onMouseLeave={() => setShowFeedback(false)}
      style={{
        position: "absolute",
        ...(isMobile ? { top: 60, left: 16 } : { top: 160, left: 16 }),
        zIndex: 1000,
      }}
    >
      <div style={{
        height: 28,
        padding: "0 10px",
        borderRadius: showFeedback ? "8px 8px 0 0" : 8,
        background: showFeedback ? "#2563EB" : "#fff",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#ddd",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        cursor: "default",
        fontSize: 12,
        color: showFeedback ? "#fff" : "#555",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        userSelect: "none",
        width: "fit-content",
      }}>
        피드백
      </div>
      <div style={{
        overflow: "hidden",
        maxHeight: showFeedback ? 200 : 0,
        transition: "max-height 0.25s ease",
        background: "#fff",
        borderTopWidth: 0,
        borderRightWidth: showFeedback ? 1 : 0,
        borderBottomWidth: showFeedback ? 1 : 0,
        borderLeftWidth: showFeedback ? 1 : 0,
        borderStyle: "solid",
        borderColor: "#ddd",
        borderRadius: "0 8px 8px 8px",
        boxShadow: showFeedback ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
        width: 220,
      }}>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, lineHeight: 1.8 }}>
            <div><span style={{ color: "#555", fontWeight: 600 }}>수신</span> {emails.to}</div>
            <div><span style={{ color: "#555", fontWeight: 600 }}>참조</span> {Array.isArray(emails.cc) ? emails.cc.join(", ") : emails.cc}</div>
            <div><span style={{ color: "#555", fontWeight: 600 }}>제목</span> {emails.subject}</div>
          </div>
          <div style={{
            fontSize: 11, color: "#888", background: "#f9fafb",
            borderRadius: 5, padding: "7px 9px", lineHeight: 1.8,
          }}>
            유형: (오류 제보 / 시설 정보 수정<br />/ 기능 제안 / 기타)<br /><br />내용:
          </div>
        </div>
      </div>
    </div>
  );
}
