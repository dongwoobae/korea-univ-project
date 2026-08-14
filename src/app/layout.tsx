import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/LanguageContext";

const SITE_URL = "https://korea-univ-project.vercel.app";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "모두의 캠퍼스 — KU 배리어프리 지도",
  description:
    "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도. 엘리베이터, 경사로, 장애인 화장실 위치를 한눈에 확인하세요.",
  keywords: [
    "고려대학교",
    "배리어프리",
    "장애인",
    "지도",
    "이동약자",
    "무장애",
    "KU",
  ],
  icons: {
    icon: "/favicon.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "모두의 캠퍼스 — KU 배리어프리 지도",
    description:
      "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도. 엘리베이터, 경사로, 장애인 화장실 위치를 한눈에 확인하세요.",
    url: "/",
    siteName: "KU 배리어프리 지도",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "KU 배리어프리 지도 — 고려대학교 무장애 캠퍼스 지도",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "모두의 캠퍼스 — KU 배리어프리 지도",
    description: "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  // 검색엔진 소유권 인증 — Google Search Console / 네이버 서치어드바이저에서 발급 후 입력
  // verification: {
  //   google: "발급받은_코드",
  //   other: { "naver-site-verification": "발급받은_코드" },
  // },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "모두의 캠퍼스 — KU 배리어프리 지도",
  description:
    "고려대학교 장애인·이동약자를 위한 배리어프리 웹 지도. 엘리베이터, 경사로, 장애인 화장실 위치를 한눈에 확인하세요.",
  url: SITE_URL,
  applicationCategory: "Map",
  operatingSystem: "Web",
  inLanguage: "ko",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  creator: {
    "@type": "Organization",
    name: "고려대학교",
    url: "https://www.korea.ac.kr",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
