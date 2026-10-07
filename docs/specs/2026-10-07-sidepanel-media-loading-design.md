# 사이드패널 사진·영상 로딩 설계

2026-10-07

## 이 문서의 목적

건물 사이드패널을 열 때 사진과 동영상이 늦게 뜨는 문제를 고친다. 원인은 렌더링이 아니라
**저장된 파일 자체**다. 그래서 업로드 경로를 고치는 것과, 이미 올라간 파일을 바꾸는 것을
함께 다룬다.

다른 문서와의 관계:

| 대상                                                                                                              | 이 문서에서                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| README `재생 불가 코덱만 H.264 변환`, `📦 스토리지` 표와 본문                                                     | 대체 — 모든 업로드에 변환을 시도하고 포스터를 함께 저장한다 (4장) |
| README `building_facilities` 스키마                                                                               | 갱신 — `video_poster_url` 추가 (5장)                              |
| `docs/TODO_list/video/cancel-during-prepare.md`                                                                   | 해소 — 작업 단위 취소 플래그 (4.3). 처리 후 TODO 파일 삭제        |
| `2026-08-04-facility-detail-modal-and-building-video-design.md` 후속 과제 `동영상 교체 시 R2에 남는 옛 객체 정리` | TODO로 옮긴다 — 이 설계가 만드는 포스터 고아와 함께 (8장)         |
| `2026-10-06-slope-units-and-editor-design.md` 부록 B                                                              | 유지 — 다운로드 파일명 `건물명-번호.webp`는 계속 참이다 (2장)     |
| `2026-08-14-strict-types-and-logging.md`의 `imageToWebP`                                                          | 기록 시점의 사실. 모듈은 이 설계에서 바뀐다 (2.1)                 |

---

## 1. 왜 바꾸는가 — 실측

2026-10-07에 운영 데이터를 anon 키로 전수 조회하고, 각 파일을 HTTP Range로 직접 읽었다.

**건물 사진 (`building_photos`, Supabase Storage)**

| 실제 내용 | 개수 | 평균 크기 |
| --------- | ---: | --------: |
| PNG       |   63 |   3,433KB |
| WebP      |    6 |     224KB |

63장 모두 이름은 `.webp`, Content-Type은 `image/webp`다. 내용을 열어 본 3장은 1920×1080 RGBA PNG였다.

원인: Safari의 canvas는 WebP를 **표시**할 수는 있지만 **인코딩**은 하지 못한다.
`canvas.toBlob(cb, "image/webp")`을 호출하면 명세대로 오류 없이 PNG를 돌려준다.
`convertToWebP`는 결과 타입을 확인하지 않았고, 업로드 라우트는 받은 내용을 그대로 `.webp`로 저장했다.

**시설 영상 (`building_facilities.video_url`, R2 `r2.dev`)**

- 59개, 합계 1,640MB, 중앙값 23.3MB, 최대 102.6MB
- 컨테이너: `video/quicktime`(MOV) 56개, `video/mp4` 3개
- moov가 파일 끝에 있는 것 58개
- 코덱: H.264 57개, HEVC 2개
- 비트레이트: 20–25Mbps 56개, 45–50Mbps 1개, 5Mbps 미만 2개

원인: 업로드는 "올리는 브라우저에서 재생이 안 될 때만" 변환했다. 아이폰 H.264는 재생되므로
원본이 그대로 올라갔다. HEVC 2개는 HEVC를 디코드하는 브라우저(Safari)에서 올라가 검사를 통과했다.
HEVC를 못 트는 브라우저에서는 검은 화면이 된다.

**운영 사이트에서 패널 열기** (Playwright Chromium, 측정 회선 약 9.5Mbps, `하나과학관 A동`: 사진 PNG 1장·영상 2개)

- 사진 표시까지 3.3초
- 3초 시점에 영상 2개 모두 `readyState 0`
- `preload` 기본값(`metadata`)인데도 15초 동안 영상마다 약 2초 분량을 미리 받음
- 재생 후 8초 동안 3.7초만 진행 (비트레이트가 회선보다 높아 끊김)

---

## 2. 사진 — 내용이 WebP인 것만 저장한다

### 2.1 브라우저 인코딩

`src/lib/imageToWebP.ts`를 대체한다. 긴 변 1920px 이내로 줄이고 WebP 품질 0.75로 인코딩하는
규칙은 그대로 둔다.

1. canvas에 그린 뒤 `toBlob(..., "image/webp", 0.75)`을 호출한다.
2. 결과 `type`이 `image/webp`이면 그대로 쓴다. Chrome·Firefox는 여기서 끝난다.
3. 아니면(Safari) `@jsquash/webp`를 **동적 import**해서, canvas의 `ImageData`를 같은 품질(75)로 인코딩한다.
   wasm은 이 경로에서만 내려받는다.

`@jsquash/webp`는 `dependencies`에 새로 추가한다.

JPEG로 대체하는 안은 기각했다. 운영 PNG 원본 3장을 sharp로 인코딩해 비교하면,
같은 PSNR(37.6dB)에서 JPEG q65가 197KB, WebP q75가 138KB다. 지금까지 올라온 사진 69장 중
63장이 이 대체 경로가 필요했던 PNG다.

서버 쪽 변환(sharp)도 기각했다. 아이폰 원본은 Vercel 함수의 요청 본문 한도를 넘는다.
그래서 저장소 직접 업로드와 후처리라는 별도 구조가 필요하다.

### 2.2 업로드 라우트

`upload-building-photo`는 클라이언트가 붙인 이름표(`file.type`)를 믿지 않는다. 바이트를 보고
아래를 모두 만족할 때만 WebP로 판정하고, 아니면 400으로 거절한다.

- 0–3바이트 `RIFF`, 8–11바이트 `WEBP`
- 12–15바이트가 `VP8 `·`VP8L`·`VP8X` 중 하나
- 4–7바이트(리틀 엔디언 RIFF 크기)가 전체 길이 − 8과 같음

이번 사고가 바로 이름표와 내용이 다른 경우였다. 이 검사가 있으면 인코더가 다시 PNG를 내놓아도
저장되기 전에 드러난다. 크기 비교는 잘린 파일을 거른다. 디코드까지 확인하지는 않는다.
신뢰 경계가 관리자이고, 서버에서 디코드하려면 이미지 라이브러리를 함수에 실어야 하기 때문이다.

판정 함수는 하나로 두고 라우트와 2.3 스크립트가 함께 쓴다. 스크립트는 Range 응답의
`Content-Range`에서 전체 길이를 얻는다.

파일 이름이 매번 고유하므로 `cacheControl`을 1년(`31536000`)으로 준다.
지금 응답은 `Cache-Control: no-cache`라 패널을 열 때마다 재검증 왕복이 생긴다.

### 2.3 기존 PNG 일괄 변환

`src/scripts/convertBuildingPhotosToWebP.ts`. 운영 쓰기이므로 사용자가 실행하고, 기본값은 `DRY_RUN`이다.
`sharp`를 `devDependencies`에 추가한다(지금은 next의 전이 의존성으로만 있다).
journal과 `--purge`는 6장의 영상 스크립트와 같은 규칙을 따른다(6.2).

1. `building_photos` 전체를 읽는다. 각 URL의 앞 16바이트와 전체 길이로 WebP 여부를 판정해, 아닌 행만 고른다.
2. 원본을 내려받아 sharp로 긴 변 1920px 이내, WebP q75로 변환한다.
3. 새 경로 `{buildingId}/{timestamp}-{rand}.webp`에 업로드한다. 라우트와 같은 `cacheControl`을 쓴다.
4. journal에 `{photoId, oldPath, newPath}`를 `uploaded`로 적는다.
5. `url`이 읽은 값과 같을 때만 행을 갱신한다. 캡션은 같은 행에 있으므로 유지된다.
   갱신되면 journal을 `updated`로 바꾼다. 조건이 맞지 않으면(그 사이 바뀜) 새 파일을 지우고 `discarded`로 적는다.
6. 옛 파일은 이 단계에서 지우지 않는다.

다시 실행해도 안전하다. WebP 행은 1단계에서 빠진다.

---

## 3. 공개 화면 영상 — 재생을 누를 때 받는다

`FacilityList`의 `<video>`에 `preload="none"`과 `poster={video_poster_url}`을 준다.

- 패널을 열 때는 포스터 JPEG(긴 변 640px)만 받는다.
- 재생을 누를 때 영상을 요청한다. faststart라 앞부분만 받으면 재생이 시작된다.
- `video_poster_url`이 `null`이면 `poster`를 주지 않는다. 컨트롤만 있는 검은 칸이 되고, 영상은 받지 않는다.

화면에 보일 때 미리 받는 안은 기각했다. 영상을 보지 않는 사용자의 데이터를 쓰지 않는 쪽을 택했다.

---

## 4. 영상 업로드 — 항상 변환을 시도한다

### 4.1 변환 규칙

모든 업로드에 다음 규칙의 변환을 **시도**한다. 실패했을 때의 예외는 4.2에 있다.

- 긴 변 1280px 이내, 비율 유지, 짝수 크기. 작은 영상은 키우지 않는다.
  지금의 `scale='min(1280,iw)':-2`는 가로 폭만 제한해서, 세로 영상(1080×1920)이 줄지 않는다.
- H.264(libx264), CRF 28, `-pix_fmt yuv420p`.
  `pix_fmt`를 고정하지 않으면 아이폰 10-bit HDR 원본이 High 10 프로파일로 인코딩된다.
  이 프로파일은 브라우저가 재생하지 못한다.
- AAC 128k, `-movflags +faststart`.
- preset만 호출하는 쪽이 정한다. 브라우저는 `ultrafast`(속도), 스크립트는 `medium`(용량)이다.

HDR → SDR 톤 매핑은 하지 않는다. HDR 원본은 색이 다소 바래 보일 수 있다.

조건부 변환(재생 불가·1280 초과·4Mbps 초과일 때만)은 기각했다. 저화질 HEVC가 계속 통과하기 때문이다.

인자는 `src/lib/videoTranscode.ts` 한 곳에 둔다. 입력·출력 이름과 preset을 받아 인자 배열을
돌려주는 함수이고, **아무것도 import하지 않는다.** 소비자가 둘이기 때문이다.

- 브라우저: `compressVideo`(ffmpeg.wasm)가 `@/lib/videoTranscode`로 가져온다.
- 일괄 스크립트: Node가 직접 실행하므로 `@/` 별칭을 모른다. 상대 경로 `../lib/videoTranscode.ts`로 가져온다.
  실행은 `node --env-file=.env.local src/scripts/<이름>.ts`(Node 24의 타입 제거 실행)다.
  타입 검사가 `.ts` 확장자 import를 받도록 tsconfig를 조정한다.

### 4.2 변환에 실패하면

1. 먼저 `compressVideo`를 시도한다.
2. 실패하고 사용자가 취소하지 않았으면 `isVideoPlayable(file)`로 원본을 검사한다.
   - 재생 가능: 원본을 올리고 "용량을 줄이지 못해 원본을 올렸어요" 경고를 띄운다.
     큰 파일이 ffmpeg.wasm 메모리를 넘는 경우처럼, 지금까지 올라가던 파일이 막히지 않게 하는 바닥선이다.
     이렇게 올라간 원본은 6장 스크립트를 다시 돌리면 줄어든다.
   - 재생 불가: 지금처럼 오류를 내고 멈춘다.

재생 검사는 실패했을 때만 한다. 성공 경로에서 최대 15초(`PLAYABILITY_PROBE_TIMEOUT_MS`)의 검사를 빼기 위해서다.

### 4.3 취소

항상 변환하면 준비 구간이 길어진다. 그러면 `cancel-during-prepare.md`의 결함이 실제로 걸린다.
게다가 4.2와 맞물려 더 나빠진다. 변환 중 모달을 닫으면 `terminateFFmpeg`가 변환을 죽이고,
그 실패가 원본 업로드로 이어진다.

**작업 단위 취소 플래그**로 막는다. `handleForceClose`가 ref를 세우고, `handleUpload`는 각 `await` 뒤에
이 값을 확인해 조용히 빠진다. 4.2의 대체 경로는 취소 확인을 통과해야만 탄다.
XHR(영상·포스터)은 지금처럼 `abort`한다.

변환 작업 자체도 멈춰야 한다. 지금 `getFFmpeg`는 `load()`가 끝난 뒤에야 인스턴스를 모듈 변수에 넣는다.
그래서 변환 도구를 **불러오는 중**에 모달을 닫으면 `terminateFFmpeg`가 아무것도 종료하지 못한다.
인스턴스를 `load()` 전에 모듈 변수에 넣고, `load()`가 실패하면 비운다.
그러면 불러오는 중에도 종료되고, `compressVideo`는 거절로 끝난다.

TODO가 남긴 다른 선택은 이렇게 정했다.

- `AbortController`는 쓰지 않는다. 준비 구간의 요청은 presign 한 번이라, 끊지 못해도 대가가 작다.
- 부분 객체는 받아들인다. R2 단일 PUT은 중단되면 객체가 생기지 않는다.
  포스터 PUT이 끝난 뒤 취소되면 수십 KB짜리 jpg가 남는다. 수거는 8장의 TODO로 둔다.
- 취소 후 `onUpdate()` 호출은 유지한다.

### 4.4 포스터

변환 결과(또는 대체로 올리는 원본)에서 한 프레임을 캡처한다.

- 위치는 `min(1초, 길이/2)`다. 촬영 시작 프레임이 검은 경우를 피한다.
- 긴 변 640px, JPEG 0.8. JPEG는 모든 브라우저의 canvas가 인코딩한다.
- 캡처에 실패해도 업로드는 진행한다(`video_poster_url = null`).
- 포스터 PUT이 200으로 끝났을 때만 confirm에 `posterUrl`을 보낸다.

### 4.5 API 계약

포스터 키는 **영상 키의 확장자를 `.jpg`로 바꾼 것**이다(`facility-videos/{id}/{ts}.jpg`).
둘이 한 쌍이라는 것을 키만 보고 검증할 수 있다.

**`facility-video-presign`**

- 요청에 선택 필드 `posterSize`를 받는다. 크기는 서명에 넣고, 상한은 1MB다. Content-Type은 `image/jpeg`로 고정한다.
- 응답은 `{ presignedUrl, publicUrl, posterPresignedUrl, posterPublicUrl }`이다.
  기존 두 필드는 이름을 그대로 둔다. `posterSize`가 없으면 포스터 두 필드는 `null`이다.

**`facility-video-confirm`**

- 선택 필드 `posterUrl`을 받는다. 키가 영상 키의 짝이 아니면 400이다.
- `video_url`과 `video_poster_url`을 함께 저장한다. `posterUrl`이 없으면 `null`로 덮는다.

**`delete-facility-video`**

두 객체의 삭제는 원자적일 수 없다. 그래서 순서로 불변식을 지킨다.
불변식은 **DB가 없는 객체를 가리키지 않는다**는 것이다.

1. 지울 키는 지금처럼 DB에 저장된 값에서 뽑는다. 포스터 키도 `isFacilityVideoKey`로 검증한다.
2. `video_url`이 클라이언트 값과 같을 때만 두 컬럼을 `null`로 만든다.
3. 영상 객체를 지운다. 실패하면 두 컬럼을 원래 값으로 되돌리고 500을 낸다. 이 시점에는 아직 아무 객체도 지워지지 않았다.
4. 포스터 객체를 지운다. 실패해도 로그만 남기고 성공으로 응답한다. DB는 이미 포스터를 참조하지 않으므로, 남는 것은 고아 jpg 하나다(8장).

### 4.6 업로드 화면 문구

- 업로드 버튼 근처에 **"가로 영상을 추천드려요"**를 둔다. 패널의 영상 칸은 가로로 넓고 높이가 180px로 제한돼, 세로 영상은 작게 보인다.
- 진행 문구: `변환 도구 불러오는 중...` → `용량을 줄이는 중... N%` → `업로드 준비 중...` → `업로드 중... N%`.

---

## 5. 데이터와 배포 순서

마이그레이션 하나: `building_facilities.video_poster_url text null`.
`supabase/database.types.ts`에도 같은 컬럼을 넣는다.

공개 패널은 `select("*")`로 읽으므로 따로 고칠 조회가 없다.

병합하면 마이그레이션(CI)과 Vercel 배포가 따로 시작된다(`docs/database-migrations.md`).
confirm이 새 컬럼에 쓰므로, 코드가 컬럼보다 먼저 뜨는 구간이 생기면 안 된다.
그 구간에 올린 영상과 포스터는 confirm이 실패해 고아가 된다.

1. 마이그레이션과 `database.types.ts`만 담은 PR을 먼저 병합하고, CI가 운영 DB에 적용한 것을 확인한다.
2. 그다음 기능 PR을 병합한다.
3. 배포를 확인한 뒤 일괄 스크립트(2.3, 6장)를 돌린다.

---

## 6. 기존 영상 일괄 변환

`src/scripts/transcodeFacilityVideos.ts`. 운영 쓰기이므로 사용자가 실행하고, 기본값은 `DRY_RUN`이다.
네이티브 ffmpeg와 ffprobe가 필요하며, `FFMPEG_PATH`·`FFPROBE_PATH` 또는 PATH에서 찾는다.

### 6.1 대상 판정 — 컬럼이 아니라 파일 내용으로

`video_poster_url`이 `null`인지로 대상을 고르지 않는다. `null`은 "아직 변환하지 않음"과
"변환했지만 포스터 캡처에 실패함"을 구분하지 못한다. `video_url`이 있는 행마다 파일을 직접 판정한다.

- **기준 충족**: ffprobe로 본 비디오 코덱이 H.264이고, `yuv420p`이며, 긴 변이 1280px 이하다.
  그리고 최상위 atom을 Range로 읽었을 때 `moov`가 `mdat`보다 앞에 있다.
- 기준 미충족 → 변환 + 포스터.
- 기준 충족, 포스터 없음 → 포스터만.
- 기준 충족, 포스터 있음 → 건너뜀.

다시 실행하면 남은 것만 처리한다. 4.2의 대체 경로로 올라간 원본도 여기서 줄어든다.

### 6.2 처리 순서와 실패 처리

행마다 순서대로 하나씩 처리한다. C: 여유 공간이 작으므로 임시 파일은 한 번에 한 행 분량만 둔다.

1. 원본을 임시 디렉터리에 내려받는다.
2. 4.1 규칙(preset `medium`)으로 변환하고, 4.4 규칙으로 포스터를 뽑는다.
3. 새 키 `facility-videos/{id}/{새 ts}.mp4`와 짝 `.jpg`를 올린다. 두 번째 업로드가 실패하면 첫 번째를 지운다.
4. journal에 `{facilityId, oldVideoKey, oldPosterKey, newVideoKey, newPosterKey}`를 `uploaded`로 적는다.
5. `video_url`과 `video_poster_url`이 둘 다 읽은 값과 같을 때만 두 컬럼을 갱신한다.
   갱신되면 `updated`로 바꾼다. 조건이 맞지 않으면 새로 올린 객체를 지우고 `discarded`로 적는다.
6. 옛 객체는 이 단계에서 지우지 않는다.
7. 행의 임시 디렉터리는 성공·실패와 무관하게 `finally`에서 지운다. 전후 크기를 출력한다.

포스터만 만드는 행은 2단계에서 포스터만 뽑고, 3단계에서 현재 영상 키의 짝 `.jpg`만 올린다.

**journal**은 저장소 루트의 `.media-migration/`(git 제외)에 스크립트별로 한 줄에 한 건씩 쌓는다. 두 스크립트가 같은 규칙을 쓴다.

- **재실행 시 정리**: 시작할 때 `uploaded`에 머문 항목을 먼저 처리한다. DB 갱신 전에 프로세스가 죽은 경우다.
  DB가 새 키를 가리키면 `updated`로 고치고, 아니면 새 객체를 지우고 `discarded`로 적는다.
- **`--purge`**: 사용자가 결과를 확인한 뒤 따로 실행한다. `updated` 항목의 옛 객체 중
  **DB가 더 이상 참조하지 않는 것만** 지우고 `purged`로 적는다. 그전까지는 원본으로 되돌릴 수 있다.

**운영 규칙**: 스크립트를 돌리는 동안에는 관리 화면에서 사진·영상을 편집하지 않는다.
조건부 갱신이 덮어쓰기는 막지만, 낡은 화면에서 지우면 새로 올린 객체가 고아로 남는다.

---

## 7. 테스트

**Vitest**

- WebP 판정: 정상 WebP(`VP8 `·`VP8L`·`VP8X`)는 통과한다. PNG, JPEG, `RIFF....WEBP` 12바이트만 있는 입력, RIFF 크기와 길이가 다른 입력, 16바이트 미만 입력은 거른다.
- 사진 인코딩: 네이티브가 WebP를 주면 wasm을 부르지 않는다. PNG를 주면 wasm 경로로 간다.
  canvas와 인코더는 주입한다(`videoPlayback.test.ts`와 같은 방식).
- `upload-building-photo`: PNG 내용과 잘린 WebP를 400으로 거절한다. WebP는 `image/webp`·1년 캐시로 저장한다.
- 변환 인자: 가로 입력과 세로 입력 각각에 대해 **인자 배열 전체**를 고정한다. scale 식, libx264, CRF 28, `yuv420p`, AAC 128k, faststart, 주입한 preset이 모두 들어간다.
- `compressVideo`: `@ffmpeg/ffmpeg`를 모킹해, `load()` 도중 `terminateFFmpeg()`를 부르면 거절로 끝나는지 본다.
- 포스터 키 짝 판정: 같은 ts의 `.jpg`만 짝이다. 다른 시설·다른 ts·다른 확장자는 아니다.
- presign: `posterSize`가 없으면 포스터 두 필드가 `null`, 있으면 서명 URL을 준다. 1MB 초과는 400이다.
- confirm: 짝이 아닌 `posterUrl`은 400이다. 없으면 `null`로 저장한다.
- delete: 영상 삭제가 실패하면 두 컬럼을 되돌리고 포스터는 지우지 않는다. 포스터 삭제만 실패하면 200이고 두 컬럼은 `null`로 남는다.
- 일괄 스크립트의 순수 함수: 대상 분류(변환·포스터만·건너뜀), journal 재실행 정리, purge 대상 선별.

**Playwright**

- 공개 패널: `<video>`에 `poster`가 붙는다. 재생 전에는 영상 URL 요청이 0건이고, 재생을 누르면 요청이 나간다.
  포스터가 `null`이면 `poster` 속성이 없다.
- 관리자 영상 모달: "가로 영상을 추천드려요"가 보인다.
- `unpkg`의 ffmpeg 코어 요청을 실패시키면, 재생 가능한 원본이 경고와 함께 올라간다.
  기존 `admin-content.spec.ts`의 업로드 테스트는 이 경로로 바뀐다.
  변환 성공 경로는 E2E에서 ffmpeg 코어(수십 MB)를 받지 않기 위해 수동 검증으로 돌린다.
- 코어 요청을 붙잡아 둔 채(불러오는 중) 모달을 닫으면 presign·confirm이 나가지 않는다.
- 포스터 PUT을 실패시키면 confirm 요청에 `posterUrl`이 없다.

**운영 재측정**

배포하고 두 스크립트를 실행한 뒤, 1장과 같은 Playwright 측정을 다시 돌려 이 문서에 결과를 적는다.

---

## 8. 범위 밖

- **R2 고아 객체 수거** → `docs/TODO_list/video/orphan-r2-objects.md`.
  영상을 교체할 때 남는 옛 영상·포스터, confirm 실패, 취소 뒤 남는 포스터, 포스터 삭제 실패가 모두 여기로 모인다.
  지금은 수거하는 주체가 없다.
- `r2.dev` → 커스텀 도메인. Cloudflare가 개발용으로 안내하는 주소이고 엣지 캐시가 없다.
  이번 측정 회선이 더 느려서 r2.dev가 병목인지는 판정하지 못했다. 도메인 결정이 필요하다.
- 클라이언트가 호출하지 않는 옛 `upload-facility-video` 라우트.
- `delete-building-photo`가 DB 값이 아니라 클라이언트가 보낸 URL로 저장소 키를 정하는 기존 동작.
- 명소 사진(`upload-landmark-photo`). 사이드패널이 아니라 지도 팝업에서 쓴다.
- next/image 최적화(`unoptimized` 제거). 파일을 바로잡는 쪽을 택했다.
