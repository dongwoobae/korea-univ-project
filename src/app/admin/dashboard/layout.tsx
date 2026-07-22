"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { FEEDBACK_EMAILS_FALLBACK, getSetting } from "@/lib/settings";
import FeedbackEmailModal from "@/components/admin/FeedbackEmailModal";
import "../admin-ui.css";

const NAV = [
  { label: "건물", href: "/admin/dashboard/buildings" },
  { label: "독립 시설", href: "/admin/dashboard/facilities" },
  { label: "명소", href: "/admin/dashboard/landmarks" },
  { label: "경사도", href: "/admin/dashboard/slopes" },
];

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [feedbackEmails, setFeedbackEmails] = useState(FEEDBACK_EMAILS_FALLBACK);
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
    supabase.auth.getUser().then(({ data: { user: authenticatedUser } }) => {
      if (!authenticatedUser) {
        router.push("/admin");
        return;
      }
      setUser(authenticatedUser);
      setAuthChecked(true);
    });
  }, [router]);

  async function handleLogout() {
    setUser(null);
    setAuthChecked(false);
    await supabase.auth.signOut();
    router.push("/admin");
  }

  if (!authChecked) return <div className="ku-admin-loading">불러오는 중...</div>;

  return (
    <div className="ku-admin-shell">
      <header className="ku-admin-header">
        <Link className="ku-admin-brand" href="/admin/dashboard/buildings">
          <img src="/favicon.png" alt="고려대학교" />
          <span>관리자 콘솔</span>
        </Link>
        <nav className="ku-admin-nav" aria-label="관리자 메뉴">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} data-active={active}>{item.label}</Link>;
          })}
        </nav>
        <div className="ku-admin-account">
          <span className="ku-admin-email">{user?.email}</span>
          <button className="ku-admin-button ku-admin-settings" type="button" onClick={() => setShowFeedbackModal(true)}>설정</button>
          <button className="ku-admin-button ku-admin-map-link" type="button" onClick={() => router.push("/")}>지도 보기</button>
          <button className="ku-admin-button" type="button" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>
      <main className="ku-admin-content">{children}</main>
      {showFeedbackModal && (
        <FeedbackEmailModal
          initialEmails={feedbackEmails}
          onClose={() => setShowFeedbackModal(false)}
          onSaved={setFeedbackEmails}
        />
      )}
    </div>
  );
}
