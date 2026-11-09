/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // E2E 웹서버(.next-e2e)가 사용자의 next dev(.next)와 dist 잠금을 공유하지 않도록 분리
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // E2E(playwright.config.ts)에서만 끈다. 왼쪽 아래 개발 표시가 모바일 아래 메뉴 줄의 첫 버튼을 덮어 누르기를 가로챈다.
  // 꺼도 빌드·실행 오류는 그대로 뜬다(Next devIndicators 문서)
  ...(process.env.NEXT_HIDE_DEV_INDICATOR === "1" && { devIndicators: false }),
  turbopack: {
    // 상위 디렉터리의 다른 lockfile로 워크스페이스 루트가 잘못 잡히는 것 방지
    root: import.meta.dirname,
    // @ffmpeg/ffmpeg의 load()는 classWorkerURL을 받으면 new Worker(new URL(그 값, import.meta.url))로
    // 워커를 띄운다. Next 16.4의 Turbopack은 이 동적 URL을 Module not found 빌드 오류로 막는다(16.2는 통과했다).
    // 이 앱은 classWorkerURL을 넘기지 않아 그 분기는 돌지 않고, 기본 분기의 ./worker.js는 그대로
    // 워커 청크로 번들된다(2026-11-09 산출물 확인). 그래서 이 파일의 이 오류만 끈다.
    ignoreIssue: [
      {
        path: /@ffmpeg[\\/]ffmpeg[\\/]dist[\\/]esm[\\/]classes\.js$/,
        title: /Module not found/,
      },
    ],
  },
  async redirects() {
    // 리디자인을 되돌릴 수 있는 동안 옛 주소를 호환 진입점으로 둔다(설계 2026-10-14 6.5). new가 :id에 먼저 잡히지 않게 위에 둔다
    return [
      {
        source: "/admin/slopes/new",
        destination: "/admin/dashboard/slopes?new=1",
        permanent: false,
      },
      {
        source: "/admin/slopes/:id",
        destination: "/admin/dashboard/slopes?id=:id&edit=1",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
