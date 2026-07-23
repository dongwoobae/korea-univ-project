# Supabase 데이터베이스 마이그레이션

운영 데이터베이스 스키마는 `supabase/migrations`와 GitHub Actions를 기준으로
관리한다. Supabase Dashboard의 SQL Editor나 Table Editor에서 운영 스키마를
직접 변경하지 않는다.

## GitHub Secrets

GitHub 저장소의 **Settings → Environments → production → Environment
secrets**에 다음 두 값을 등록한다. Repository secrets에 등록해도 동작하지만,
운영 환경 승인 규칙을 사용할 수 있도록 Environment secrets를 권장한다.

| 이름                   | 값                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`      | Dashboard **Connect → Session pooler**의 포트 `5432` URI. `[YOUR-PASSWORD]` 문자열은 그대로 둔다. |
| `SUPABASE_DB_PASSWORD` | 해당 프로젝트의 실제 Database password                                                            |

워크플로는 비밀번호를 URL 인코딩한 뒤 완성된 연결 문자열을 GitHub 로그에서
마스킹한다. Direct connection URI는 GitHub 호스팅 러너의 IPv4 환경에서
실패할 수 있으므로 받지 않는다.

## 개발 흐름

1. 스키마 변경마다 새 파일을 만든다.

   ```bash
   supabase migration new add_example_column
   ```

2. 생성된 `YYYYMMDDHHMMSS_lower_snake_case.sql` 파일에 변경 SQL을 작성한다.
3. PR을 열면 CI가 기존 마이그레이션의 수정·삭제·이름 변경을 거부한다.
4. `main` 반영 후 일반 CI가 모두 통과하면 새 마이그레이션만 운영 DB에
   타임스탬프 순으로 적용한다.
5. 적용 후 로컬 파일과 원격 `supabase_migrations.schema_migrations` 이력이
   모두 일치하는지 자동 검증한다.

적용된 마이그레이션은 절대 수정하지 않는다. 변경이나 보완이 필요하면 더 늦은
타임스탬프의 새 마이그레이션을 추가한다.

## 수동 재실행과 실패 대응

GitHub Actions의 **CI → Run workflow**로 전체 검증과 마이그레이션 동기화를
수동 재실행할 수 있다. 이미 적용된 마이그레이션은 다시 실행되지 않는다.

실패 시 SQL을 Dashboard에서 따로 실행하지 않는다. 먼저 Actions 로그와 아래
명령으로 이력 차이를 확인한다.

```bash
supabase migration list --db-url "<SESSION_POOLER_URL>"
```

`migration repair`는 실제 스키마가 이미 적용됐거나 실제로 미적용됐다는 사실을
확인한 경우에만 사용한다. 이 명령은 SQL을 실행하지 않고 이력만 바꾼다.

## Vercel 배포와의 관계

Vercel Git 연동 배포와 GitHub Actions는 서로 독립적으로 시작될 수 있다.
따라서 한 릴리스 안에서 기존 컬럼을 즉시 제거하거나 이름을 바꾸지 않는다.
먼저 새 컬럼·테이블을 추가하고 호환 코드를 배포한 뒤, 사용이 끝난 기존
스키마는 후속 마이그레이션에서 제거한다.
