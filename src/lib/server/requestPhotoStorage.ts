import { randomUUID } from "node:crypto";
import {
  FACILITY_PHOTO_BUCKET,
  FACILITY_REQUEST_PHOTO_BUCKET,
  PHOTO_CACHE_CONTROL,
  photoObjectPath,
} from "@/lib/facilityPhotos";
import { supabaseAdmin } from "./supabaseAdmin";

const SIGNED_URL_SECONDS = 600;

export async function uploadPhoto(
  bucket: string,
  folderId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const path = photoObjectPath(folderId, randomUUID());
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, bytes, {
      contentType: "image/webp",
      cacheControl: PHOTO_CACHE_CONTROL,
    });
  if (error) {
    console.error("[photo-storage] upload failed", {
      bucket,
      message: error.message,
    });
    return null;
  }
  return path;
}

export async function removeObject(
  bucket: string,
  path: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin().storage.from(bucket).remove([path]);
  if (error)
    console.error("[photo-storage] remove failed", {
      bucket,
      message: error.message,
    });
  return !error;
}

/** 행이 생기기 전에 실패해 남은 파일까지 지우려고 행이 아니라 폴더를 나열한다(설계 2.7). */
export async function removeFolder(
  bucket: string,
  folderId: string,
): Promise<boolean> {
  const storage = supabaseAdmin().storage.from(bucket);
  const { data, error } = await storage.list(folderId, { limit: 100 });
  if (error) {
    console.error("[photo-storage] list failed", {
      bucket,
      message: error.message,
    });
    return false;
  }
  const paths = (data ?? []).map((item) => `${folderId}/${item.name}`);
  if (paths.length === 0) return true;
  const { error: removeError } = await storage.remove(paths);
  if (removeError) {
    console.error("[photo-storage] folder remove failed", {
      bucket,
      message: removeError.message,
    });
  }
  return !removeError;
}

export async function copyToFacility(
  requestPhotoPath: string,
  facilityId: string,
): Promise<string | null> {
  const destination = photoObjectPath(facilityId, randomUUID());
  const { error } = await supabaseAdmin()
    .storage.from(FACILITY_REQUEST_PHOTO_BUCKET)
    .copy(requestPhotoPath, destination, {
      destinationBucket: FACILITY_PHOTO_BUCKET,
    });
  if (error) {
    console.error("[photo-storage] copy failed", { message: error.message });
    return null;
  }
  return destination;
}

/** 파일을 먼저, 행을 나중에 지운다 — 끝 상태 요청에 행이 남으면 정리가 실패했다는 뜻이 된다(설계 2.7). */
export async function cleanupRequestPhotos(
  requestId: string,
): Promise<boolean> {
  if (!(await removeFolder(FACILITY_REQUEST_PHOTO_BUCKET, requestId)))
    return false;
  const { error } = await supabaseAdmin()
    .from("facility_request_photos")
    .delete()
    .eq("request_id", requestId);
  if (error)
    console.error("[photo-storage] request photo rows delete failed", {
      message: error.message,
    });
  return !error;
}

export async function signedUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data, error } = await supabaseAdmin()
    .storage.from(FACILITY_REQUEST_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) {
    console.error("[photo-storage] sign failed", { message: error.message });
    return result;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}
