"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Moon, Sun } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { flushQueue } from "@/lib/activityReport";
import { NOT_ADMIN_REASON } from "@/lib/adminAccess";
import { authedFetch } from "@/lib/authedFetch";
import { setColorMode, useColorMode } from "@/lib/useColorMode";
import {
  FEEDBACK_EMAILS_FALLBACK,
  getSetting,
  normalizeFeedbackEmails,
} from "@/lib/settings";
import FeedbackEmailModal from "@/components/admin/FeedbackEmailModal";
import {
  UnsavedChangesProvider,
  useUnsavedChangesGuard,
} from "@/components/admin/UnsavedChangesGuard";
import { requestWorkspaceClose } from "@/components/admin/workspace/useWorkspaceSelection";
import "../admin-ui.css";

const INBOX_HREF = "/admin/dashboard/inbox";
const NAV = [
  { label: "건물", href: "/admin/dashboard/buildings" },
  { label: "독립 시설", href: "/admin/dashboard/facilities" },
  { label: "명소", href: "/admin/dashboard/landmarks" },
  { label: "경사도", href: "/admin/dashboard/slopes" },
  { label: "제보함", href: INBOX_HREF },
  { label: "로그", href: "/admin/dashboard/logs" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
      <DashboardShell>{children}</DashboardShell>
    </UnsavedChangesProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
  const [feedbackEmails, setFeedbackEmails] = useState(
    FEEDBACK_EMAILS_FALLBACK,
  );
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { blocked, guard } = useUnsavedChangesGuard();
  const darkMode = useColorMode() === "dark";
  const themeLabel = darkMode ? "라이트모드" : "다크모드";
  const ThemeIcon = darkMode ? Sun : Moon;

  function toggleColorMode() {
    setColorMode(darkMode ? "light" : "dark");
  }

  useEffect(() => {
    let cancelled = false;
    getSetting("feedback_emails", FEEDBACK_EMAILS_FALLBACK).then((value) => {
      if (!cancelled) setFeedbackEmails(normalizeFeedbackEmails(value));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      const response = await authedFetch("/api/inbox-counts").catch(() => null);
      if (!response?.ok || cancelled) return;
      const body = (await response.json().catch(() => null)) as {
        requests: number;
        feedback: number;
      } | null;
      if (!body || cancelled) return;
      setInboxCount(body.requests + body.feedback);
    }
    const timer = window.setTimeout(() => void loadCounts(), 0);
    const refresh = () => void loadCounts();
    window.addEventListener("inboxCountsChanged", refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("inboxCountsChanged", refresh);
    };
  }, [pathname]);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user: authenticatedUser },
      } = await supabase.auth.getUser();
      if (!authenticatedUser) {
        router.push("/admin");
        return;
      }
      // API의 requireAdmin과 같은 기준(admin_users)으로 화면 진입을 막는다. 설계 2026-10-19 6장
      const { data: listed, error } = await supabase.rpc("is_admin");
      if (error) {
        setAccessCheckFailed(true);
        return;
      }
      if (!listed) {
        await supabase.auth.signOut();
        router.push(`/admin?reason=${NOT_ADMIN_REASON}`);
        return;
      }
      setUser(authenticatedUser);
      setAuthChecked(true);
      void flushQueue();
    }
    void checkAccess();
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setUser(null);
    setAuthChecked(false);
    await supabase.auth.signOut();
    router.push("/admin");
  }

  function navigate(href: string) {
    guard(() => router.push(href));
  }

  // onNavigate가 불리지 않는 클릭과 지금 페이지를 가리키는 링크는 설계 2026-10-14 3.4
  function confirmBeforeLink(href: string) {
    return (event: { preventDefault: () => void }) => {
      if (href === pathname && requestWorkspaceClose()) {
        event.preventDefault();
        return;
      }
      if (!blocked) return;
      event.preventDefault();
      navigate(href);
    };
  }

  if (accessCheckFailed)
    return (
      <div className="ku-admin-loading" role="alert">
        <p>관리자 권한을 확인하지 못했어요.</p>
        <button
          className="ku-admin-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          다시 시도
        </button>
      </div>
    );
  if (!authChecked)
    return <div className="ku-admin-loading">불러오는 중...</div>;

  return (
    <div className="ku-admin-shell">
      <header className="ku-admin-header">
        <Link
          className="ku-admin-brand"
          href="/admin/dashboard/buildings"
          onNavigate={confirmBeforeLink("/admin/dashboard/buildings")}
        >
          <Image src="/favicon.png" alt="고려대학교" width={32} height={32} />
          <span>관리자 콘솔</span>
        </Link>
        <nav className="ku-admin-nav" aria-label="관리자 메뉴">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                onNavigate={confirmBeforeLink(item.href)}
              >
                {item.label}
                {item.href === INBOX_HREF && inboxCount > 0 && (
                  <span className="ku-admin-nav-badge">
                    <span aria-hidden="true">{inboxCount}</span>
                    <span className="ku-sr-only">신규 {inboxCount}건</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ku-admin-account">
          <span className="ku-admin-email">{user?.email}</span>
          <button
            className="ku-admin-button ku-admin-theme"
            type="button"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={toggleColorMode}
          >
            <ThemeIcon size={18} aria-hidden="true" />
          </button>
          <button
            className="ku-admin-button ku-admin-settings"
            type="button"
            onClick={() => setShowFeedbackModal(true)}
          >
            설정
          </button>
          <button
            className="ku-admin-button ku-admin-map-link"
            type="button"
            onClick={() => navigate("/")}
          >
            지도 보기
          </button>
          <button
            className="ku-admin-button ku-admin-logout"
            type="button"
            onClick={() => guard(() => void handleLogout())}
          >
            로그아웃
          </button>
          <div className="ku-admin-menu" ref={menuRef}>
            <button
              className="ku-admin-button ku-admin-menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="계정 메뉴"
              ref={menuTriggerRef}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div
                className="ku-admin-menu-popover"
                role="menu"
                aria-label="계정 메뉴"
              >
                {user?.email && (
                  <span className="ku-admin-menu-email">{user.email}</span>
                )}
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    toggleColorMode();
                    // 이 항목은 아무것도 열지 않는다 — 닫히는 메뉴와 함께 초점이 떨어지지 않게 돌린다(docs/specs/2026-10-28-dark-mode-design.md 1.3)
                    menuTriggerRef.current?.focus();
                  }}
                >
                  {themeLabel}
                </button>
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowFeedbackModal(true);
                  }}
                >
                  피드백 이메일 설정
                </button>
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/");
                  }}
                >
                  공개 지도 보기
                </button>
                <button
                  className="ku-admin-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    guard(() => void handleLogout());
                  }}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
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
