import { randomUUID } from "node:crypto";
import {
  FACILITY_PHOTO_BUCKET,
  FACILITY_REQUEST_PHOTO_BUCKET,
  PHOTO_CACHE_CONTROL,
  photoObjectPath,
} from "@/lib/facilityPhotos";
import { supabaseAdmin } from "./supabaseAdmin";

const SIGNED_URL_SECONDS = 600;
const LIST_PAGE_SIZE = 100;
// 한 폴더는 사진 몇 장뿐이다. 지운 뒤에도 같은 페이지가 계속 나오면(삭제가 반영되지 않음) 무한히 돌지 않게 끊는다.
const MAX_REMOVE_ROUNDS = 10;

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

/**
 * 행이 생기기 전에 실패해 남은 파일까지 지우려고 행이 아니라 폴더를 나열한다(설계 2.7).
 * 지운 뒤 다시 나열하면 다음 묶음이 맨 앞부터 나오므로, 한 페이지보다 적게 나올 때까지 반복한다.
 */
export async function removeFolder(
  bucket: string,
  folderId: string,
): Promise<boolean> {
  const storage = supabaseAdmin().storage.from(bucket);
  for (let round = 0; round < MAX_REMOVE_ROUNDS; round += 1) {
    const { data, error } = await storage.list(folderId, {
      limit: LIST_PAGE_SIZE,
    });
    if (error) {
      console.error("[photo-storage] list failed", {
        bucket,
        folderId,
        message: error.message,
      });
      return false;
    }
    const items = data ?? [];
    if (items.length === 0) return true;
    const { error: removeError } = await storage.remove(
      items.map((item) => `${folderId}/${item.name}`),
    );
    if (removeError) {
      console.error("[photo-storage] folder remove failed", {
        bucket,
        folderId,
        message: removeError.message,
      });
      return false;
    }
    if (items.length < LIST_PAGE_SIZE) return true;
  }
  console.error("[photo-storage] folder remove did not finish", {
    bucket,
    folderId,
  });
  return false;
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
    console.error("[photo-storage] copy failed", {
      requestPhotoPath,
      facilityId,
      message: error.message,
    });
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
      requestId,
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
