import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { transcodeArgs } from "@/lib/videoTranscode";

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpeg: FFmpeg | null = null;
let ready: Promise<FFmpeg> | null = null;

export function terminateFFmpeg() {
  ffmpeg?.terminate();
  ffmpeg = null;
  ready = null;
}

function getFFmpeg(): Promise<FFmpeg> {
  if (ready) return ready;
  // load()가 끝나기 전에 넣어 둬야 불러오는 중에도 terminateFFmpeg가 이 인스턴스에 닿는다.
  const instance = new FFmpeg();
  ffmpeg = instance;
  const loading = (async () => {
    const coreURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await toBlobURL(
      `${CORE_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    );
    // 코어를 받는 사이 종료됐다. 받는 요청 자체는 끊을 수단이 없다.
    if (ffmpeg !== instance) throw new Error("ffmpeg terminated");
    await instance.load({ coreURL, wasmURL });
    return instance;
  })();
  ready = loading;
  loading.catch(() => {
    if (ffmpeg === instance) {
      ffmpeg = null;
      ready = null;
    }
  });
  return loading;
}

export async function compressVideo(
  file: File,
  /** 0~100 */
  onProgress?: (progress: number) => void,
  onPhase?: (phase: "loading" | "compressing") => void,
): Promise<Blob> {
  if (ready === null) onPhase?.("loading");

  const ff = await getFFmpeg();
  onPhase?.("compressing");

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  };
  ff.on("progress", handleProgress);

  const inputName = "input" + file.name.slice(file.name.lastIndexOf("."));
  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec(transcodeArgs(inputName, "output.mp4", "ultrafast"));
    const data = await ff.readFile("output.mp4");
    await ff.deleteFile(inputName);
    await ff.deleteFile("output.mp4");
    ff.off("progress", handleProgress);
    onProgress?.(100);
    return new Blob([data as unknown as BlobPart], { type: "video/mp4" });
  } catch (error) {
    // 메모리 부족 등으로 실패한 wasm을 다음 업로드가 다시 쓰지 않게 버린다.
    if (ffmpeg === ff) terminateFFmpeg();
    throw error;
  }
}
