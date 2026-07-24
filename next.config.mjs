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
};

export default nextConfig;
