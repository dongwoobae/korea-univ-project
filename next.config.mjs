/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // E2E 웹서버(.next-e2e)가 사용자의 next dev(.next)와 dist 잠금을 공유하지 않도록 분리
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    // 상위 디렉터리의 다른 lockfile로 워크스페이스 루트가 잘못 잡히는 것 방지
    root: import.meta.dirname,
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
