import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

export function terminateFFmpeg() {
  if (ffmpeg) {
    ffmpeg.terminate();
    ffmpeg = null;
  }
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  const instance = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await instance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpeg = instance;
  return instance;
}

export async function compressVideo(
  file: File,
  /** 0~100 */
  onProgress?: (progress: number) => void,
  onPhase?: (phase: "loading" | "compressing") => void,
): Promise<Blob> {
  const needsLoad = ffmpeg === null;
  if (needsLoad) onPhase?.("loading");

  const ff = await getFFmpeg();
  onPhase?.("compressing");

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  };
  ff.on("progress", handleProgress);

  const inputName = "input" + file.name.slice(file.name.lastIndexOf("."));
  await ff.writeFile(inputName, await fetchFile(file));

  await ff.exec([
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-crf",
    "28",
    "-preset",
    "ultrafast",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);

  const data = await ff.readFile("output.mp4");

  await ff.deleteFile(inputName);
  await ff.deleteFile("output.mp4");
  ff.off("progress", handleProgress);

  onProgress?.(100);
  return new Blob([data as unknown as BlobPart], { type: "video/mp4" });
}
