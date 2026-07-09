/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    // 상위 디렉터리의 다른 lockfile로 워크스페이스 루트가 잘못 잡히는 것 방지
    root: import.meta.dirname,
  },
};

export default nextConfig;
