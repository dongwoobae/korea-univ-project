import { authedFetch } from "@/lib/authedFetch";
import type { PhotoMoveDirection } from "@/lib/buildingPhotoOrder";
import {
  FALLBACK_FACILITY_STYLE,
  facilityStyleOf,
  type FacilityIconKey,
} from "@/lib/facilityStyleCatalog";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType } from "@/types/domain";

/** 관리자 시설 종류 관리의 규칙과 쓰기. 설계: docs/specs/2026-10-26-facility-type-management-design.md 3장 */

export const TYPE_LABEL_MAX = 30;
export const TYPE_TRANSLATION_MAX = 60;

export interface FacilityTypeFormValues {
  label: string;
  label_en: string;
  label_zh: string;
  icon: FacilityIconKey;
  color: string;
}

export function typeFormFrom(
  type: FacilityType | null,
): FacilityTypeFormValues {
  const style = type
    ? facilityStyleOf([type], type.code)
    : FALLBACK_FACILITY_STYLE;
  return {
    label: type?.label ?? "",
    label_en: type?.label_en ?? "",
    label_zh: type?.label_zh ?? "",
    icon: style.icon,
    color: style.color,
  };
}

/** 빈 번역은 NULL이다. 화면들이 `label_en ?? label`처럼 NULL일 때만 한국어로 떨어뜨린다(설계 3.3) */
export function typePayload(form: FacilityTypeFormValues) {
  const optional = (value: string) => value.trim() || null;
  return {
    label: form.label.trim(),
    label_en: optional(form.label_en),
    label_zh: optional(form.label_zh),
    icon: form.icon,
    color: form.color,
  };
}

export type FacilityTypePayload = ReturnType<typeof typePayload>;

/** 자동번역은 입력 칸의 maxLength를 거치지 않고 칸을 채워 번역 이름 길이는 여기서 본다 */
export function typeFormError(
  form: FacilityTypeFormValues,
  types: readonly Pick<FacilityType, "code" | "label">[],
  editingCode: string | null,
): string | null {
  const label = form.label.trim();
  if (!label) return "한국어 이름을 적어 주세요";
  if (form.label_en.trim().length > TYPE_TRANSLATION_MAX)
    return `영어 이름은 ${TYPE_TRANSLATION_MAX}자까지예요`;
  if (form.label_zh.trim().length > TYPE_TRANSLATION_MAX)
    return `중국어 이름은 ${TYPE_TRANSLATION_MAX}자까지예요`;
  if (
    types.some(
      (type) =>
        type.code !== editingCode && (type.label ?? "").trim() === label,
    )
  )
    return "같은 이름의 종류가 있어요";
  return null;
}

const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 관리자가 정하지 않고 만든 뒤 바꾸지 않는다 — 시설·등록 요청이 이 값으로 종류를 가리킨다(설계 1.5) */
export function newFacilityTypeCode(
  random: () => number = Math.random,
): string {
  let suffix = "";
  for (let index = 0; index < 8; index += 1)
    suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `type_${suffix}`;
}

/** 맞바꾸기 RPC 인자. DB 함수가 방향까지 보므로 화면 순서(앞 종류, 뒤 종류)로 준다. 끝이라 옮길 수 없으면 null */
export function typeSwapArgs(
  types: readonly { code: string }[],
  index: number,
  direction: PhotoMoveDirection,
): { p_first: string; p_second: string } | null {
  const front = direction === "earlier" ? index - 1 : index;
  const back = front + 1;
  if (front < 0 || back >= types.length) return null;
  return { p_first: types[front].code, p_second: types[back].code };
}

/** 두 종류의 자리와 번호를 맞바꾼다. 저장 중인 맞바꾸기를 받은 목록 위에 겹쳐 그리는 데 쓴다 */
export function swapTypeOrder<T extends { code: string; sort_order: number }>(
  types: readonly T[],
  firstCode: string,
  secondCode: string,
): T[] {
  const first = types.findIndex((type) => type.code === firstCode);
  const second = types.findIndex((type) => type.code === secondCode);
  const next = [...types];
  if (first < 0 || second < 0) return next;
  next[first] = { ...types[second], sort_order: types[first].sort_order };
  next[second] = { ...types[first], sort_order: types[second].sort_order };
  return next;
}

/**
 * 저장 중인 맞바꾸기를 받은 목록 위에 겹친다. 앞 종류가 이미 뒤에 있으면(다시 받은 목록에 반영됐거나 그사이 바뀌었다) 겹치지
 * 않는다 — 그대로 바꾸면 반영된 순서를 다시 뒤집는다.
 */
export function withPendingSwap<T extends { code: string; sort_order: number }>(
  types: readonly T[],
  swap: { p_first: string; p_second: string } | null,
): readonly T[] {
  if (!swap) return types;
  const first = types.findIndex((type) => type.code === swap.p_first);
  const second = types.findIndex((type) => type.code === swap.p_second);
  return first >= 0 && first < second
    ? swapTypeOrder(types, swap.p_first, swap.p_second)
    : types;
}

export interface FacilityTypeUsageCount {
  facilities: number;
  pendingRequests: number;
}

export type FacilityTypeUsage = Record<string, FacilityTypeUsageCount>;

/** 끝난 요청(승인·거절)은 기록이라 막지 않는다(설계 3.4). 받은 현황에 없는 종류는 지울 수 있는지 모른다 */
export function deleteBlockReason(
  usage: FacilityTypeUsage,
  code: string,
): string | null {
  const count = Object.hasOwn(usage, code) ? usage[code] : undefined;
  if (!count) return "사용 현황을 불러오지 못했어요";
  const reasons: string[] = [];
  if (count.facilities > 0)
    reasons.push(`시설 ${count.facilities}곳이 이 종류를 써요`);
  if (count.pendingRequests > 0)
    reasons.push(
      `검토 대기 요청 ${count.pendingRequests}건이 이 종류로 들어왔어요`,
    );
  return reasons.length > 0 ? reasons.join(" · ") : null;
}

export async function fetchFacilityTypeUsage(): Promise<FacilityTypeUsage | null> {
  try {
    const response = await authedFetch("/api/facility-types/usage");
    if (!response.ok) return null;
    return (await response.json()) as FacilityTypeUsage;
  } catch {
    return null;
  }
}

export async function translateTypeLabel(
  label: string,
): Promise<{ en?: string; zh?: string } | null> {
  try {
    const response = await authedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: { label } }),
    });
    if (!response.ok) return null;
    const { en, zh } = (await response.json()) as {
      en?: { label?: string };
      zh?: { label?: string };
    };
    return { en: en?.label, zh: zh?.label };
  } catch {
    return null;
  }
}

/** 빈 칸만 채운다. 요청이 도는 사이 직접 적은 값을 덮지 않는다(명소 `applyLandmarkTranslations`와 같은 규칙) */
export function fillEmptyTranslations(
  form: FacilityTypeFormValues,
  translated: { en?: string; zh?: string },
): FacilityTypeFormValues {
  return {
    ...form,
    label_en: form.label_en.trim()
      ? form.label_en
      : (translated.en ?? form.label_en),
    label_zh: form.label_zh.trim()
      ? form.label_zh
      : (translated.zh ?? form.label_zh),
  };
}

export type TypeWriteResult = { ok: true } | { ok: false; code?: string };

/** 코드는 기본 키라 겹치면 DB가 거부한다(`23505`). 새 값으로 한 번 더 시도한다(설계 1.5) */
export async function insertFacilityType(
  payload: FacilityTypePayload,
  makeCode: () => string = newFacilityTypeCode,
): Promise<TypeWriteResult> {
  let failure: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase
      .from("facility_types")
      .insert({ code: makeCode(), ...payload });
    if (!error) return { ok: true };
    failure = error.code;
    if (failure !== "23505") break;
  }
  return { ok: false, code: failure };
}

/** 고치기·지우기가 0행으로 끝났다. RLS가 걸렀거나 그사이 지워진 행은 오류 없이 0행이다 */
export const TYPE_WRITE_MISSED = "not_found";

function writeResult(
  data: unknown[] | null,
  error: { code: string } | null,
): TypeWriteResult {
  if (error) return { ok: false, code: error.code };
  return data && data.length > 0
    ? { ok: true }
    : { ok: false, code: TYPE_WRITE_MISSED };
}

export async function updateFacilityType(
  code: string,
  payload: FacilityTypePayload,
): Promise<TypeWriteResult> {
  const { data, error } = await supabase
    .from("facility_types")
    .update(payload)
    .eq("code", code)
    .select("code");
  return writeResult(data, error);
}

export async function deleteFacilityType(
  code: string,
): Promise<TypeWriteResult> {
  const { data, error } = await supabase
    .from("facility_types")
    .delete()
    .eq("code", code)
    .select("code");
  return writeResult(data, error);
}
