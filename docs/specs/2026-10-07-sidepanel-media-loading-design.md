# 사이드패널 사진·영상 로딩 설계

2026-10-07

## 이 문서의 목적

건물 사이드패널을 열 때 사진과 동영상이 늦게 뜨는 문제를 고친다. 원인은 렌더링이 아니라
**저장된 파일 자체**다. 그래서 업로드 경로를 고치는 것과, 이미 올라간 파일을 바꾸는 것을
함께 다룬다.

다른 문서와의 관계:

| 대상                                                     | 이 문서에서                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| README `재생 불가 코덱만 H.264 변환`                     | 대체 — 모든 업로드를 변환한다 (4장)                           |
| `docs/TODO_list/video/cancel-during-prepare.md`          | 해소 — 작업 단위 취소 플래그 (4.3). 처리 후 TODO 파일 삭제    |
| `2026-10-06-slope-units-and-editor-design.md` 부록 B     | 유지 — 다운로드 파일명 `건물명-번호.webp`는 계속 참이다 (2장) |
| `2026-08-14-strict-types-and-logging.md`의 `imageToWebP` | 기록 시점의 사실. 모듈은 이 설계에서 바뀐다 (2.1)             |

---

## 1. 왜 바꾸는가 — 실측

2026-10-07에 운영 데이터를 anon 키로 전수 조회하고, 각 파일을 HTTP Range로 직접 읽었다.

**건물 사진 (`building_photos`, Supabase Storage)**

| 실제 내용 | 개수 | 평균 크기 |
| --------- | ---: | --------: |
| PNG       |   63 |   3,433KB |
| WebP      |    6 |     224KB |

63장 모두 이름은 `.webp`, Content-Type은 `image/webp`다. 내용은 1920×1080 RGBA PNG다.

원인: Safari의 canvas는 WebP를 **표시**할 수는 있지만 **인코딩**은 하지 못한다.
`canvas.toBlob(cb, "image/webp")`을 호출하면 명세대로 오류 없이 PNG를 돌려준다.
`convertToWebP`는 결과 타입을 확인하지 않았고, 업로드 라우트는 받은 내용을 그대로 `.webp`로 저장했다.

**시설 영상 (`building_facilities.video_url`, R2 `r2.dev`)**

- 59개, 합계 1,640MB, 중앙값 23.3MB, 최대 102.6MB
- 컨테이너: `video/quicktime`(MOV) 56개, `video/mp4` 3개
- moov가 파일 끝에 있는 것 58개
- 코덱: H.264 57개, HEVC 2개
- 비트레이트: 20~~25Mbps 56개, 45~~50Mbps 1개, 5Mbps 미만 2개

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

JPEG로 대체하는 안은 기각했다. 운영 PNG 원본 3장을 sharp로 인코딩해 비교하면,
같은 PSNR(37.6dB)에서 JPEG q65가 197KB, WebP q75가 138KB다. 지금까지 올라온 사진 69장 중
63장이 이 대체 경로가 필요했던 PNG다.

서버 쪽 변환(sharp)도 기각했다. 아이폰 원본은 Vercel 함수의 요청 본문 한도를 넘는다.
그래서 저장소 직접 업로드와 후처리라는 별도 구조가 필요하다.

### 2.2 업로드 라우트

`upload-building-photo`는 클라이언트가 붙인 이름표(`file.type`)를 믿지 않는다.
**앞 12바이트가 `RIFF....WEBP`가 아니면 400**으로 거절한다. 이번 사고가 바로 이름표와 내용이
다른 경우였다. 이 검사가 있으면 인코더가 다시 PNG를 내놓아도 저장되기 전에 드러난다.

파일 이름이 매번 고유하므로 `cacheControl`을 1년(`31536000`)으로 준다.
지금 응답은 `Cache-Control: no-cache`라 패널을 열 때마다 재검증 왕복이 생긴다.

### 2.3 기존 PNG 일괄 변환

`src/scripts/convertBuildingPhotosToWebP.ts`. 운영 쓰기이므로 사용자가 실행하고, 기본값은 `DRY_RUN`이다.

1. `building_photos` 전체를 읽는다. 각 URL의 앞 12바이트를 Range로 읽어 WebP가 아닌 행만 고른다.
2. 원본을 내려받아 sharp로 긴 변 1920px 이내, WebP q75로 변환한다.
3. 새 경로 `{buildingId}/{timestamp}-{rand}.webp`에 업로드한다. 라우트와 같은 `cacheControl`을 쓴다.
4. `url`이 읽은 값과 같을 때만 행을 갱신한다. 캡션은 같은 행에 있으므로 유지된다.
5. 갱신되면 옛 파일을 지운다. 갱신 조건이 맞지 않으면(그 사이 바뀜) 새 파일을 지운다.

다시 실행해도 안전하다. WebP 행은 1단계에서 빠진다.

---

## 3. 공개 화면 영상 — 재생을 누를 때 받는다

`FacilityList`의 `<video>`에 `preload="none"`과 `poster={video_poster_url}`을 준다.

- 패널을 열 때는 포스터 JPEG(긴 변 640px)만 받는다.
- 재생을 누를 때 영상을 요청한다. faststart라 앞부분만 받으면 재생이 시작된다.
- `video_poster_url`이 `null`이면 `poster`를 주지 않는다. 컨트롤만 있는 검은 칸이 되고, 영상은 받지 않는다.

화면에 보일 때 미리 받는 안은 기각했다. 영상을 보지 않는 사용자의 데이터를 쓰지 않는 쪽을 택했다.

---

## 4. 영상 업로드 — 항상 줄여서 올린다

### 4.1 변환 규칙

모든 업로드를 다음 규칙으로 변환한다. 인자는 `src/lib/videoTranscode.ts` 한 곳에 두고,
브라우저(`compressVideo`, ffmpeg.wasm)와 일괄 스크립트(네이티브 ffmpeg)가 함께 가져다 쓴다.

- 긴 변 1280px 이내, 비율 유지, 짝수 크기.
  지금의 `scale='min(1280,iw)':-2`는 가로 폭만 제한해서, 세로 영상(1080×1920)이 줄지 않는다.
- H.264(libx264), CRF 28, `-pix_fmt yuv420p`.
  `pix_fmt`를 고정하지 않으면 아이폰 10-bit HDR 원본이 High 10 프로파일로 인코딩된다.
  이 프로파일은 브라우저가 재생하지 못한다.
- AAC 128k, `-movflags +faststart`.
- preset만 호출하는 쪽이 정한다. 브라우저는 `ultrafast`(속도), 스크립트는 `medium`(용량)이다.

HDR → SDR 톤 매핑은 하지 않는다. HDR 원본은 색이 다소 바래 보일 수 있다.

조건부 변환(재생 불가·1280 초과·4Mbps 초과일 때만)은 기각했다. 저화질 HEVC가 계속 통과하기 때문이다.

### 4.2 변환에 실패하면

1. 먼저 `compressVideo`를 시도한다.
2. 실패하고 사용자가 취소하지 않았으면 `isVideoPlayable(file)`로 원본을 검사한다.
   - 재생 가능: 원본을 올리고 "용량을 줄이지 못해 원본을 올렸어요" 경고를 띄운다.
     큰 파일이 ffmpeg.wasm 메모리를 넘는 경우처럼, 지금까지 올라가던 파일이 막히지 않게 하는 바닥선이다.
   - 재생 불가: 지금처럼 오류를 내고 멈춘다.

재생 검사는 실패했을 때만 한다. 성공 경로에서 최대 15초(`PLAYABILITY_PROBE_TIMEOUT_MS`)의 검사를 빼기 위해서다.

### 4.3 취소

항상 변환하면 준비 구간이 길어진다. 그러면 `cancel-during-prepare.md`의 결함이 실제로 걸린다.
게다가 4.2와 맞물려 더 나빠진다. 변환 중 모달을 닫으면 `terminateFFmpeg`가 변환을 죽이고,
그 실패가 원본 업로드로 이어진다.

**작업 단위 취소 플래그**로 막는다. `handleForceClose`가 ref를 세우고, `handleUpload`는 각 `await` 뒤에
이 값을 확인해 조용히 빠진다. 4.2의 대체 경로는 취소 확인을 통과해야만 탄다.
XHR(영상·포스터)은 지금처럼 `abort`한다.

TODO가 남긴 다른 선택은 이렇게 정했다.

- `AbortController`는 쓰지 않는다. 준비 구간의 요청은 presign 한 번이라, 끊지 못해도 대가가 작다.
- 부분 객체는 남기고 받아들인다. R2 단일 PUT은 중단되면 객체가 생기지 않는다.
  포스터 PUT이 끝난 뒤 취소되면 수십 KB짜리 jpg가 남는다.
  `동영상 교체 시 R2에 남는 옛 객체 정리`와 같은 후속 과제로 둔다.
- 취소 후 `onUpdate()` 호출은 유지한다.

### 4.4 포스터

변환 결과(또는 대체로 올리는 원본)에서 한 프레임을 캡처한다.

- 위치는 `min(1초, 길이/2)`다. 촬영 시작 프레임이 검은 경우를 피한다.
- 긴 변 640px, JPEG 0.8. JPEG는 모든 브라우저의 canvas가 인코딩한다.
- 캡처에 실패해도 업로드는 진행한다(`video_poster_url = null`).

### 4.5 API 계약

포스터 키는 **영상 키의 확장자를 `.jpg`로 바꾼 것**이다(`facility-videos/{id}/{ts}.jpg`).
둘이 한 쌍이라는 것을 키만 보고 검증할 수 있다.

| 라우트                   | 바뀌는 점                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facility-video-presign` | 요청에 선택 필드 `posterSize`를 받는다. 있으면 포스터 PUT URL을 함께 발급한다. 크기는 서명에 넣고 상한은 1MB다. `contentType`은 `image/jpeg`로 고정한다. |
| `facility-video-confirm` | 선택 필드 `posterUrl`을 받는다. 키가 영상 키의 짝이 아니면 400이다. `video_url`과 `video_poster_url`을 함께 저장하고, 없으면 `null`로 덮는다.            |
| `delete-facility-video`  | DB에 저장된 포스터 키도 `isFacilityVideoKey`로 검증한 뒤 함께 지운다. 두 컬럼을 함께 `null`로 만들고, 저장소 실패 시 둘 다 되돌린다.                     |

### 4.6 업로드 화면 문구

- 업로드 버튼 근처에 **"가로 영상을 추천드려요"**를 둔다. 패널의 영상 칸은 가로로 넓고 높이가 180px로 제한돼, 세로 영상은 작게 보인다.
- 진행 문구: `변환 도구 불러오는 중...` → `용량을 줄이는 중... N%` → `업로드 준비 중...` → `업로드 중... N%`.

---

## 5. 데이터와 배포 순서

마이그레이션 하나: `building_facilities.video_poster_url text null`.
`supabase/database.types.ts`에도 같은 컬럼을 넣는다.

공개 패널은 `select("*")`로 읽으므로 따로 고칠 조회가 없다.

병합하면 마이그레이션(CI)과 Vercel 배포가 따로 시작된다(`docs/database-migrations.md`).

- 코드가 먼저 뜨고 컬럼이 아직 없는 몇 분 사이에 영상을 올리면, confirm이 실패한다. 다시 올리면 된다.
- 읽는 쪽은 컬럼이 없으면 `undefined`가 되어 포스터 없이 동작한다.
- 일괄 스크립트(2.3, 6장)는 마이그레이션이 적용된 것을 확인한 뒤 돌린다.

---

## 6. 기존 영상 일괄 변환

`src/scripts/transcodeFacilityVideos.ts`. 운영 쓰기이므로 사용자가 실행하고, 기본값은 `DRY_RUN`이다.
네이티브 ffmpeg가 필요하며, `FFMPEG_PATH` 또는 PATH에서 찾는다.

대상은 `video_url`이 있고 `video_poster_url`이 `null`인 행이다. 다시 실행하면 남은 것만 처리한다.

행마다 순서대로 처리한다. C: 여유 공간이 작으므로 한 번에 하나만 임시 디렉터리에 둔다.

1. 원본을 내려받는다.
2. 4.1 규칙(preset `medium`)으로 변환한다. 4.4 규칙으로 포스터를 뽑는다.
3. 새 키 `facility-videos/{id}/{새 ts}.mp4`와 짝 `.jpg`로 업로드한다.
4. `video_url`이 읽은 값과 같고 `video_poster_url`이 `null`일 때만 두 컬럼을 갱신한다.
5. 갱신되면 옛 객체를 지운다. 조건이 맞지 않으면 새로 올린 두 객체를 지운다.
6. 임시 파일을 지우고, 전후 크기를 출력한다.

---

## 7. 테스트

**Vitest**

- WebP 바이트 판정: WebP·PNG·JPEG·짧은 입력
- 사진 인코딩: 네이티브가 WebP를 주면 wasm을 부르지 않는다. PNG를 주면 wasm 경로로 간다.
  canvas와 인코더는 주입한다(`videoPlayback.test.ts`와 같은 방식).
- `upload-building-photo`: PNG 내용을 400으로 거절한다. WebP는 `image/webp`·1년 캐시로 저장한다.
- 변환 인자: 가로·세로 모두 긴 변 1280, `yuv420p`, faststart, preset 주입.
- 포스터 키 짝 판정: 같은 ts의 `.jpg`만 짝이다. 다른 시설·다른 ts·다른 확장자는 아니다.
- presign: `posterSize` 유무, 1MB 초과 거절.
- confirm: 짝이 아닌 `posterUrl`은 400. 없으면 `null`로 저장.
- delete: 포스터도 지우고, 저장소 실패 시 두 컬럼을 되돌린다.

**Playwright**

- 공개 패널: `<video>`가 `preload="none"`이고 `poster`가 붙는다. 포스터가 `null`이면 `poster` 속성이 없다.
- 관리자 영상 모달: "가로 영상을 추천드려요"가 보인다.
- `unpkg`의 ffmpeg 코어 요청을 실패시키면, 재생 가능한 원본이 경고와 함께 올라간다.
  기존 `admin-content.spec.ts`의 업로드 테스트는 이 경로로 바뀐다. 변환 성공 경로는 E2E에서 ffmpeg 코어(수십 MB)를 받지 않기 위해 수동 검증으로 돌린다.
- 변환 중 모달을 닫으면 presign·confirm이 나가지 않는다.

**운영 재측정**

배포하고 두 스크립트를 실행한 뒤, 1장과 같은 Playwright 측정을 다시 돌려 이 문서에 결과를 적는다.

---

## 8. 범위 밖

- `r2.dev` → 커스텀 도메인. Cloudflare가 개발용으로 안내하는 주소이고 엣지 캐시가 없다.
  이번 측정 회선이 더 느려서 r2.dev가 병목인지는 판정하지 못했다. 도메인 결정이 필요하다.
- 동영상을 교체할 때 옛 객체(이제 포스터 포함)가 R2에 남는 기존 동작.
- 클라이언트가 호출하지 않는 옛 `upload-facility-video` 라우트.
- 명소 사진(`upload-landmark-photo`). 사이드패널이 아니라 지도 팝업에서 쓴다.
- next/image 최적화(`unoptimized` 제거). 파일을 바로잡는 쪽을 택했다.
