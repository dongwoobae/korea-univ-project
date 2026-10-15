# 모두의 캠퍼스 — KU 배리어프리 웹 지도

고려대학교 구성원과 방문자가 캠퍼스의 접근성 정보를 지도에서 확인할 수 있는 웹 서비스입니다.

## 주요 기능

- **인터랙티브 지도:** 건물, 접근성 시설, 경사도와 캠퍼스 정보를 지도에서 탐색
- **검색과 안내:** 장소 검색·필터, 건물·시설 상세 정보, 다국어 UI
- **정보 관리:** 관리자가 건물·시설·명소 정보를 관리하고, 이용자 시설 요청과 피드백을 검토

## 기술 스택

Next.js · React · TypeScript · Leaflet · Supabase · Cloudflare R2 · Vercel

## 프로젝트 구조

```text
src/app/       페이지와 API 라우트
src/components/화면 컴포넌트
src/lib/        지도·데이터 처리 유틸리티
supabase/       DB 설정과 마이그레이션
docs/           설계·접근성 점검·로드맵
e2e/            Playwright 테스트
```

## 로컬 실행

Supabase와 미디어·지도 기능에 필요한 환경변수를 설정한 뒤 실행합니다.

```bash
npm install
npm run dev
```

주요 검증 명령: `npm run lint`, `npm run typecheck`, `npm run test`

## 더 알아보기

- [DeepWiki 개요](https://deepwiki.com/dongwoobae/korea-univ-project)
- [DeepWiki 시작하기와 환경 설정](https://deepwiki.com/dongwoobae/korea-univ-project/1.1-getting-started-and-configuration)
- [프로젝트 문서와 로드맵](https://deepwiki.com/dongwoobae/korea-univ-project/1.2-project-documentation-and-roadmap)

**프로젝트:** 2026학년도 고려대학교 체인지메이커스 프로젝트(대학원)
