import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import {
  r2,
  R2_BUCKET,
  getPublicR2Url,
  getR2KeyFromPublicUrl,
} from "../lib/r2.ts";
import {
  VIDEO_MAX_EDGE,
  posterArgs,
  posterSeekTime,
  transcodeArgs,
} from "../lib/videoTranscode.ts";
import {
  facilityVideoKey,
  facilityVideoPosterKey,
} from "../lib/videoUpload.ts";
import {
  appendJournal,
  pendingUploads,
  purgeCandidates,
  readJournal,
  resolvePending,
} from "./lib/mediaJournal.ts";
import {
  type VideoAction,
  type VideoProbe,
  classifyVideo,
  moovBeforeMdat,
} from "./lib/videoTarget.ts";

// 실행: FFMPEG_PATH=... FFPROBE_PATH=... node --env-file=.env.local src/scripts/transcodeFacilityVideos.ts [--purge]
// 기본은 읽기만 한다. 실제로 쓰려면 DRY_RUN=0. 설계 2026-10-07 6장.
const DRY_RUN = process.env.DRY_RUN !== "0";
const PURGE = process.argv.includes("--purge");
const JOURNAL = ".media-migration/facility-videos.jsonl";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type VideoRow = {
  id: string;
  video_url: string;
  video_poster_url: string | null;
};

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)}MB`;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on(
      "data",
      (chunk) => (stderr = (stderr + chunk).slice(-2000)),
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr}`)),
    );
  });
}

async function topLevelAtoms(url: string, total: number): Promise<string[]> {
  const types: string[] = [];
  let offset = 0;
  while (offset < total && types.length < 32) {
    const res = await fetch(url, {
      headers: { Range: `bytes=${offset}-${offset + 15}` },
    });
    const view = new DataView(await res.arrayBuffer());
    let size = view.getUint32(0);
    const type = String.fromCharCode(
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
    if (size === 1) size = Number(view.getBigUint64(8));
    if (size === 0) size = total - offset;
    types.push(type);
    offset += size;
  }
  return types;
}

async function contentLength(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" });
  return Number(res.headers.get("content-length"));
}

async function probe(input: string, atoms: string[]): Promise<VideoProbe> {
  const out = await run(FFPROBE, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,pix_fmt,width,height:format=duration",
    "-of",
    "json",
    input,
  ]);
  const json = JSON.parse(out) as {
    streams: {
      codec_name: string;
      pix_fmt: string;
      width: number;
      height: number;
    }[];
    format: { duration?: string };
  };
  const stream = json.streams[0];
  return {
    codec: stream.codec_name,
    pixFmt: stream.pix_fmt,
    width: stream.width,
    height: stream.height,
    duration: Number(json.format.duration),
    moovBeforeMdat: moovBeforeMdat(atoms),
  };
}

async function download(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${res.status} ${url}`);
  await pipeline(
    Readable.fromWeb(res.body as WebReadableStream),
    createWriteStream(path),
  );
}

async function putObject(key: string, path: string, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: await readFile(path),
      ContentType: contentType,
    }),
  );
}

async function deleteObjects(keys: string[]) {
  for (const key of keys)
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

function rowKeys(row: {
  video_url: string | null;
  video_poster_url: string | null;
}) {
  return [row.video_url, row.video_poster_url]
    .map((url) => (url ? getR2KeyFromPublicUrl(url) : null))
    .filter((key): key is string => key !== null);
}

async function referencedKeys(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("building_facilities")
    .select("video_url, video_poster_url");
  if (error) throw error;
  return new Set((data ?? []).flatMap(rowKeys));
}

async function reconcilePending() {
  const pending = pendingUploads(readJournal(JOURNAL).values());
  if (pending.length === 0) return;
  const referenced = await referencedKeys();
  for (const entry of pending) {
    const outcome = resolvePending(entry, referenced);
    console.log(`[정리] ${entry.id} ${entry.newKeys.join(",")} → ${outcome}`);
    if (DRY_RUN) continue;
    if (outcome === "discarded") await deleteObjects(entry.newKeys);
    appendJournal(JOURNAL, { ...entry, status: outcome });
  }
}

async function purge() {
  const candidates = purgeCandidates(
    readJournal(JOURNAL).values(),
    await referencedKeys(),
  );
  for (const entry of candidates) {
    console.log(`[purge] ${entry.id} ${entry.oldKeys.join(",")}`);
    if (DRY_RUN) continue;
    await deleteObjects(entry.oldKeys);
    appendJournal(JOURNAL, { ...entry, status: "purged" });
  }
  console.log(
    `purge 대상 ${candidates.length}건${DRY_RUN ? " (DRY_RUN)" : ""}`,
  );
}

async function processRow(row: VideoRow, action: VideoAction, size: number) {
  const currentKey = getR2KeyFromPublicUrl(row.video_url);
  if (!currentKey) throw new Error(`R2 키가 아님: ${row.video_url}`);
  const tempDir = await mkdtemp(join(tmpdir(), "ku-video-"));
  try {
    const input = join(tempDir, "input");
    const output = join(tempDir, "output.mp4");
    const poster = join(tempDir, "poster.jpg");
    await download(row.video_url, input);

    let newVideoKey: string | null = null;
    let posterSource = input;
    if (action === "transcode") {
      await run(FFMPEG, [
        "-v",
        "error",
        "-y",
        ...transcodeArgs(input, output, "medium"),
      ]);
      newVideoKey = facilityVideoKey(row.id, "mp4", Date.now());
      posterSource = output;
    }
    const { duration } = await probe(posterSource, ["moov"]);
    await run(FFMPEG, [
      "-v",
      "error",
      "-y",
      ...posterArgs(posterSource, poster, posterSeekTime(duration)),
    ]);
    const newPosterKey = facilityVideoPosterKey(newVideoKey ?? currentKey);

    const newKeys = newVideoKey ? [newVideoKey, newPosterKey] : [newPosterKey];
    if (newVideoKey) await putObject(newVideoKey, output, "video/mp4");
    try {
      await putObject(newPosterKey, poster, "image/jpeg");
    } catch (error) {
      if (newVideoKey) await deleteObjects([newVideoKey]);
      throw error;
    }

    const oldKeys = newVideoKey ? rowKeys(row) : [];
    const entry = { id: row.id, oldKeys, newKeys };
    appendJournal(JOURNAL, { ...entry, status: "uploaded" });

    let update = supabase
      .from("building_facilities")
      .update({
        video_url: newVideoKey ? getPublicR2Url(newVideoKey) : row.video_url,
        video_poster_url: getPublicR2Url(newPosterKey),
      })
      .eq("id", row.id)
      .eq("video_url", row.video_url);
    update =
      row.video_poster_url === null
        ? update.is("video_poster_url", null)
        : update.eq("video_poster_url", row.video_poster_url);
    const { data: updated } = await update.select("id").maybeSingle();

    if (updated) {
      appendJournal(JOURNAL, { ...entry, status: "updated" });
      const after = newVideoKey ? (await stat(output)).size : size;
      console.log(`${row.id} ${action}: ${mb(size)} → ${mb(after)}`);
    } else {
      await deleteObjects(newKeys);
      appendJournal(JOURNAL, { ...entry, status: "discarded" });
      console.log(`${row.id}: 그 사이 바뀌어 건너뜀`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function convert() {
  const { data, error } = await supabase
    .from("building_facilities")
    .select("id, video_url, video_poster_url")
    .not("video_url", "is", null)
    .order("id");
  if (error) throw error;
  const counts: Record<VideoAction, number> = {
    transcode: 0,
    poster: 0,
    skip: 0,
  };
  let failed = 0;
  for (const row of (data ?? []) as VideoRow[]) {
    try {
      const size = await contentLength(row.video_url);
      const meta = await probe(
        row.video_url,
        await topLevelAtoms(row.video_url, size),
      );
      const action = classifyVideo(
        meta,
        row.video_poster_url !== null,
        VIDEO_MAX_EDGE,
      );
      counts[action]++;
      console.log(
        `[${action}] ${row.id} ${mb(size)} ${meta.codec}/${meta.pixFmt} ${meta.width}x${meta.height} moov앞=${meta.moovBeforeMdat}`,
      );
      if (DRY_RUN || action === "skip") continue;
      await processRow(row, action, size);
    } catch (error) {
      failed++;
      console.error(`[실패] ${row.id}`, error);
    }
  }
  console.log(
    `변환 ${counts.transcode} · 포스터만 ${counts.poster} · 건너뜀 ${counts.skip} · 실패 ${failed}${DRY_RUN ? " (DRY_RUN — DRY_RUN=0으로 실행해야 쓴다)" : ""}`,
  );
}

await reconcilePending();
await (PURGE ? purge() : convert());
