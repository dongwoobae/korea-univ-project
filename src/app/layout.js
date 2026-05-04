import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/LanguageContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://korea-univ-project.vercel.app";

export const metadata = {
  title: "모두의 캠퍼스 — KU 배리어프리 지도",
  description:
    "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도. 엘리베이터, 경사로, 장애인 화장실 위치를 한눈에 확인하세요.",
  keywords: ["고려대학교", "배리어프리", "장애인", "지도", "이동약자", "무장애", "KU"],
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "모두의 캠퍼스 — KU 배리어프리 지도",
    description: "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도",
    url: SITE_URL,
    siteName: "KU 배리어프리 지도",
    locale: "ko_KR",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
