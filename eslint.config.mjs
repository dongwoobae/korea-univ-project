import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettier와 충돌하는 포맷 관련 규칙 비활성화 (포맷은 Prettier가 담당).
  prettier,
  // React 19의 새 엄격 규칙은 동작하는 기존 코드를 다수 지적 → warn으로 완화
  // (CI 차단 방지, 가시성 유지). no-explicit-any는 전부 제거 완료하여 error 유지.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      // 로그 싱크가 없어 stdout이 유일한 출력이다. 실패만 남기고 성공·진입
      // 로그는 두지 않는다 — 성공은 응답과 액세스 로그가 이미 말한다.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  // 빌드/유틸 스크립트는 CommonJS require 허용. stdout이 이 스크립트들의 UI라
  // no-console도 풀어 준다.
  {
    files: ["src/scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright e2e 실행용 로컬 빌드 산출물 (.gitignore 대상).
    ".next-e2e/**",
  ]),
]);

export default eslintConfig;
