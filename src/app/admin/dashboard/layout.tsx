"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { FEEDBACK_EMAILS_FALLBACK, getSetting } from "@/lib/settings";
import FeedbackEmailModal from "@/components/admin/FeedbackEmailModal";

const NAV = [
  { label: "🏢 건물 관리", href: "/admin/dashboard/buildings" },
  { label: "📍 독립 시설", href: "/admin/dashboard/facilities" },
  { label: "📐 경사도 경로", href: "/admin/dashboard/slopes" },
];

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [feedbackEmails, setFeedbackEmails] = useState(
    FEEDBACK_EMAILS_FALLBACK,
  );
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled && value) setFeedbackEmails(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setUser(user);
      setAuthChecked(true);
    });
  }, []);

  async function handleLogout() {
    setUser(null);
    setAuthChecked(false);
    await supabase.auth.signOut();
    router.push("/admin");
  }

  if (!authChecked) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          color: "#aaa",
          fontSize: 14,
        }}
      >
        불러오는 중...
      </div>
    );
  }

  const navItems = NAV.map((item) => {
    const active =
      pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        style={{
          display: "block",
          padding: isMobile ? "6px 12px" : "10px 16px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          color: active ? "#2563EB" : "#444",
          background: active ? "#EFF6FF" : "transparent",
          textDecoration: "none",
          transition: "background 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          모두의 캠퍼스 — 관리자
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!isMobile && (
            <span style={{ fontSize: 13, color: "#888" }}>{user?.email}</span>
          )}
          <button
            onClick={() => setShowFeedbackModal(true)}
            style={{
              fontSize: 12,
              color: "#666",
              background: "none",
              border: "none",
              padding: "4px 6px",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            ✉️ 피드백 이메일 변경
          </button>
          <button
            onClick={() => router.push("/")}
            style={{
              fontSize: 13,
              color: "#2563EB",
              background: "none",
              border: "1px solid #2563EB",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ← 지도 보기
          </button>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 13,
              color: "#DC2626",
              background: "none",
              border: "1px solid #DC2626",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* 데스크탑: 사이드바 */}
        {!isMobile && (
          <div
            style={{
              width: 200,
              background: "#fff",
              borderRight: "1px solid #e5e7eb",
              padding: 16,
              flexShrink: 0,
            }}
          >
            {navItems}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* 모바일: 탭바 */}
          {isMobile && (
            <div
              style={{
                background: "#fff",
                borderBottom: "1px solid #e5e7eb",
                padding: "8px 16px",
                display: "flex",
                gap: 8,
              }}
            >
              {navItems}
            </div>
          )}

          {/* 콘텐츠 */}
          <div style={{ flex: 1, background: "#f5f5f5" }}>{children}</div>
        </div>
      </div>

      {showFeedbackModal && (
        <FeedbackEmailModal
          initialEmails={feedbackEmails}
          onClose={() => setShowFeedbackModal(false)}
          onSaved={(value) => setFeedbackEmails(value)}
        />
      )}
    </div>
  );
}
