import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  BUILDING_PHOTO_BUCKET,
  BUILDING_PHOTO_CACHE_CONTROL,
  buildingPhotoPath,
  buildingPhotoPathFromUrl,
} from "../lib/buildingPhotos.ts";
import { isWebP, WEBP_SNIFF_BYTES } from "../lib/webpBytes.ts";
import {
  appendJournal,
  pendingUploads,
  purgeCandidates,
  readJournal,
  resolvePending,
} from "./lib/mediaJournal.ts";

// 실행: node --env-file=.env.local src/scripts/convertBuildingPhotosToWebP.ts [--purge]
// 기본은 읽기만 한다. 실제로 쓰려면 DRY_RUN=0. 설계 2026-10-07 2.3·6.2.
const DRY_RUN = process.env.DRY_RUN !== "0";
const PURGE = process.argv.includes("--purge");
const JOURNAL = ".media-migration/building-photos.jsonl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const bucket = supabase.storage.from(BUILDING_PHOTO_BUCKET);

type PhotoRow = { id: number; building_id: number; url: string };

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;

async function readHead(url: string) {
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${WEBP_SNIFF_BYTES - 1}` },
  });
  const head = new Uint8Array(await res.arrayBuffer());
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { head, total: Number.isFinite(total) ? total : head.length };
}

async function referencedPaths(): Promise<Set<string>> {
  const { data, error } = await supabase.from("building_photos").select("url");
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => buildingPhotoPathFromUrl(row.url))
      .filter((path): path is string => path !== null),
  );
}

async function reconcilePending() {
  const pending = pendingUploads(readJournal(JOURNAL).values());
  if (pending.length === 0) return;
  const referenced = await referencedPaths();
  for (const entry of pending) {
    const outcome = resolvePending(entry, referenced);
    console.log(`[정리] ${entry.id} ${entry.newKeys.join(",")} → ${outcome}`);
    if (DRY_RUN) continue;
    if (outcome === "discarded") await bucket.remove(entry.newKeys);
    appendJournal(JOURNAL, { ...entry, status: outcome });
  }
}

async function purge() {
  const candidates = purgeCandidates(
    readJournal(JOURNAL).values(),
    await referencedPaths(),
  );
  for (const entry of candidates) {
    console.log(`[purge] ${entry.id} ${entry.oldKeys.join(",")}`);
    if (DRY_RUN) continue;
    const { error } = await bucket.remove(entry.oldKeys);
    if (error) console.error(`[purge 실패] ${entry.id}`, error);
    else appendJournal(JOURNAL, { ...entry, status: "purged" });
  }
  console.log(
    `purge 대상 ${candidates.length}건${DRY_RUN ? " (DRY_RUN)" : ""}`,
  );
}

async function convert() {
  const { data, error } = await supabase
    .from("building_photos")
    .select("id, building_id, url")
    .order("id");
  if (error) throw error;
  let targets = 0;
  for (const row of (data ?? []) as PhotoRow[]) {
    const { head, total } = await readHead(row.url);
    if (isWebP(head, total)) continue;
    targets++;
    if (DRY_RUN) {
      console.log(`[대상] ${row.id} ${kb(total)} ${row.url}`);
      continue;
    }
    const original = Buffer.from(await (await fetch(row.url)).arrayBuffer());
    const webp = await sharp(original)
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();
    const oldPath = buildingPhotoPathFromUrl(row.url);
    const newPath = buildingPhotoPath(
      row.building_id,
      Date.now(),
      Math.random().toString(36).slice(2),
    );
    const { error: uploadError } = await bucket.upload(newPath, webp, {
      contentType: "image/webp",
      cacheControl: BUILDING_PHOTO_CACHE_CONTROL,
    });
    if (uploadError) {
      console.error(`[업로드 실패] ${row.id}`, uploadError);
      continue;
    }
    const entry = {
      id: String(row.id),
      oldKeys: oldPath ? [oldPath] : [],
      newKeys: [newPath],
    };
    appendJournal(JOURNAL, { ...entry, status: "uploaded" });
    const newUrl = `${bucket.getPublicUrl(newPath).data.publicUrl}?t=${Date.now()}`;
    const { data: updated } = await supabase
      .from("building_photos")
      .update({ url: newUrl })
      .eq("id", row.id)
      .eq("url", row.url)
      .select("id")
      .maybeSingle();
    if (updated) {
      appendJournal(JOURNAL, { ...entry, status: "updated" });
      console.log(`${row.id}: ${kb(total)} → ${kb(webp.length)}`);
    } else {
      await bucket.remove([newPath]);
      appendJournal(JOURNAL, { ...entry, status: "discarded" });
      console.log(`${row.id}: 그 사이 바뀌어 건너뜀`);
    }
  }
  console.log(
    `대상 ${targets}건${DRY_RUN ? " (DRY_RUN — DRY_RUN=0으로 실행해야 쓴다)" : ""}`,
  );
}

await reconcilePending();
await (PURGE ? purge() : convert());
