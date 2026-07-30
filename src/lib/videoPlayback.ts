/** 판별 대기 한도(ms). 이 시간 안에 메타데이터가 오지 않으면 재생 불가로 본다. */
export const PLAYABILITY_PROBE_TIMEOUT_MS = 15_000;

type ProbeOptions = {
  /** 테스트에서 <video>를 대체하기 위한 주입 지점 */
  createVideo?: () => HTMLVideoElement;
  timeoutMs?: number;
};

/**
 * 브라우저가 이 파일의 **비디오 트랙을 실제로 디코드할 수 있는지** 검사한다.
 *
 * MIME 검사(video/mp4 등)만으로는 부족하다. 아이폰 기본 촬영물은 HEVC(hvc1)를
 * mp4/mov 컨테이너에 담기 때문에 형식 검사를 통과하고, Chromium에서
 * loadedmetadata·duration까지 정상으로 보이지만 HEVC 디코더가 없어
 * videoWidth/videoHeight가 0으로 남는다. 이 상태로 업로드되면 공개 화면에서
 * 컨트롤과 소리는 동작하는데 화면만 검게 나온다.
 *
 * 그래서 canPlayType이 아니라 메타데이터 로드 후 videoWidth로 판정한다.
 * 재생 불가로 판정된 파일은 업로드 전에 H.264로 변환해야 한다.
 */
export function isVideoPlayable(
  file: Blob,
  { createVideo, timeoutMs = PLAYABILITY_PROBE_TIMEOUT_MS }: ProbeOptions = {},
): Promise<boolean> {
  const video = createVideo ? createVideo() : document.createElement("video");
  const url = URL.createObjectURL(file);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (playable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(playable);
    };

    const onMetadata = () => finish(video.videoWidth > 0);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);

    video.preload = "metadata";
    video.muted = true;
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}
