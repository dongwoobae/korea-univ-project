"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FacilityFields, {
  type FacilityFieldLabels,
} from "@/components/facility/FacilityFields";
import TurnstileWidget from "@/components/TurnstileWidget";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import {
  MAX_FACILITY_PHOTOS,
  MAX_FACILITY_PHOTO_BYTES,
} from "@/lib/facilityPhotos";
import {
  REQUEST_ERROR_KEYS,
  submitFacilityRequest,
  uploadRequestPhoto,
} from "@/lib/facilityRequestClient";
import { convertToWebP } from "@/lib/imageToWebP";
import { supabase } from "@/lib/supabaseClient";
import type { LangCode } from "@/lib/translations";
import { useModalFocus } from "@/lib/useModalFocus";

type SlotStatus =
  "converting" | "ready" | "too_large" | "uploading" | "done" | "failed";
interface PhotoSlot {
  key: string;
  status: SlotStatus;
  blob: Blob | null;
  previewUrl: string | null;
}
type Phase = "form" | "sending" | "uploading" | "retry" | "done";

interface FacilityRequestModalProps {
  buildingId: number;
  buildingName: string;
  mapCenter: [number, number];
  siteKey: string;
  lang: LangCode;
  t: (key: string) => string;
  onClose: () => void;
}

export default function FacilityRequestModal({
  buildingId,
  buildingName,
  mapCenter,
  siteKey,
  lang,
  t,
  onClose,
}: FacilityRequestModalProps) {
  const titleId = useId();
  const fieldId = useId();
  const [fields, setFields] = useState<FacilityFieldValues>(
    EMPTY_FACILITY_FIELDS,
  );
  const [types, setTypes] = useState<{ code: string; label: string }[]>([]);
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const requestRef = useRef<{ id: string; uploadToken: string } | null>(null);
  const slotsRef = useRef(slots);
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    closeOnEscape: phase !== "sending",
  });

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(
    () => () => {
      for (const slot of slotsRef.current)
        if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh")
      .then(({ data }) => {
        if (cancelled) return;
        setTypes(
          (data ?? []).map((type) => ({
            code: type.code,
            label:
              (lang === "en"
                ? type.label_en
                : lang === "zh"
                  ? type.label_zh
                  : type.label) ??
              type.label ??
              type.code,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const updateSlot = useCallback((key: string, patch: Partial<PhotoSlot>) => {
    setSlots((previous) =>
      previous.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    );
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_FACILITY_PHOTOS - slots.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      setSlots((previous) => [
        ...previous,
        { key, status: "converting", blob: null, previewUrl: null },
      ]);
      convertToWebP(file)
        .then((blob) => {
          if (blob.size > MAX_FACILITY_PHOTO_BYTES) {
            updateSlot(key, { status: "too_large" });
            return;
          }
          updateSlot(key, {
            status: "ready",
            blob,
            previewUrl: URL.createObjectURL(blob),
          });
        })
        .catch(() => updateSlot(key, { status: "failed" }));
    }
  }

  function removeSlot(key: string) {
    setSlots((previous) => {
      const target = previous.find((slot) => slot.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((slot) => slot.key !== key);
    });
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) =>
        setFields((previous) => ({
          ...previous,
          lat: coords.latitude.toFixed(7),
          lng: coords.longitude.toFixed(7),
        })),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function uploadPending() {
    const request = requestRef.current;
    if (!request) return;
    setPhase("uploading");
    let stopped = false;
    let failed = false;
    // slotsRef는 렌더 뒤에 갱신된다 — 루프 결과는 지역 변수로 센다.
    for (const slot of slotsRef.current) {
      if (!slot.blob || (slot.status !== "ready" && slot.status !== "failed"))
        continue;
      if (stopped) continue;
      updateSlot(slot.key, { status: "uploading" });
      const result = await uploadRequestPhoto(
        request.id,
        request.uploadToken,
        slot.blob,
      );
      if (result === "done") {
        updateSlot(slot.key, { status: "done" });
        continue;
      }
      updateSlot(slot.key, {
        status: result === "too_large" ? "too_large" : "failed",
      });
      if (result === "token" || result === "closed") {
        setErrorKey(
          result === "token"
            ? "requestErrorTokenExpired"
            : "requestErrorClosed",
        );
        stopped = true;
      } else if (result === "failed") {
        failed = true;
      }
    }
    // 토큰 만료·검토 시작이면 다시 올릴 수 없으니 끝낸다. 요청 자체는 접수됐다.
    setPhase(failed && !stopped ? "retry" : "done");
  }

  async function submit() {
    if (!fields.facility_code) {
      setErrorKey("requestTypeRequired");
      return;
    }
    if (!token) return;
    setErrorKey(null);
    setPhase("sending");
    const result = await submitFacilityRequest({
      buildingId,
      fields: {
        facility_code: fields.facility_code,
        name: fields.name,
        description: fields.description,
        floor_info: fields.floor_info,
        lat: fields.lat ? Number(fields.lat) : null,
        lng: fields.lng ? Number(fields.lng) : null,
      },
      turnstileToken: token,
      website,
    });
    if (!result.ok) {
      setErrorKey(REQUEST_ERROR_KEYS[result.error]);
      // Turnstile 토큰은 한 번만 검증된다 — 다시 보내려면 새 토큰이 필요하다.
      setToken(null);
      setWidgetKey((key) => key + 1);
      setPhase("form");
      return;
    }
    if (!result.id || !result.uploadToken) {
      setPhase("done");
      return;
    }
    requestRef.current = { id: result.id, uploadToken: result.uploadToken };
    await uploadPending();
  }

  const labels: FacilityFieldLabels = {
    type: t("requestTypeLabel"),
    typePlaceholder: t("requestTypePlaceholder"),
    name: t("requestNameLabel"),
    namePlaceholder: t("requestNamePlaceholder"),
    description: t("requestDescriptionLabel"),
    descriptionPlaceholder: t("requestDescriptionPlaceholder"),
    floor: t("requestFloorLabel"),
    floorPlaceholder: t("requestFloorPlaceholder"),
    location: t("requestLocationLabel"),
    installed: t("requestInstalledLabel"),
  };
  const busy = phase === "sending" || phase === "uploading";
  const converting = slots.some((slot) => slot.status === "converting");

  return createPortal(
    <div className="ku-request-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="ku-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="ku-request-modal-title">
          {t("requestTitle")}
        </h2>
        <p className="ku-request-modal-subtitle">
          {buildingName} · {t("requestSubtitle")}
        </p>

        {phase === "done" ? (
          <div role="status" className="ku-request-modal-done">
            <p>{t("requestDone")}</p>
            {errorKey && <p className="ku-request-modal-note">{t(errorKey)}</p>}
            <button
              type="button"
              className="ku-request-modal-primary"
              onClick={onClose}
            >
              {t("closeLabel")}
            </button>
          </div>
        ) : (
          <>
            <FacilityFields
              idPrefix={fieldId}
              value={fields}
              onChange={setFields}
              facilityTypes={types}
              labels={labels}
              mapCenter={mapCenter}
              highlightBuildingId={buildingId}
              showFloor
              showInstalled={false}
              disabled={phase !== "form"}
              locationFooter={
                <button
                  type="button"
                  className="ku-current-location-button"
                  onClick={locate}
                  disabled={phase !== "form"}
                >
                  <span aria-hidden="true">📍</span> {t("requestLocateButton")}
                </button>
              }
            />

            <div className="ku-request-photos">
              <div className="ku-request-photos-label">
                {t("requestPhotosLabel")}
              </div>
              <ul className="ku-request-photo-slots">
                {slots.map((slot, index) => (
                  <li
                    key={slot.key}
                    className="ku-request-photo-slot"
                    data-status={slot.status}
                  >
                    {slot.previewUrl && (
                      <img
                        src={slot.previewUrl}
                        alt={`${t("requestPhotosLabel")} ${index + 1}`}
                      />
                    )}
                    <span className="ku-request-photo-status">
                      {slot.status === "converting" &&
                        t("requestPhotoConverting")}
                      {slot.status === "too_large" && t("requestPhotoTooLarge")}
                      {slot.status === "uploading" &&
                        t("requestPhotoUploading")}
                      {slot.status === "done" && t("requestPhotoDone")}
                      {slot.status === "failed" && t("requestPhotoFailed")}
                    </span>
                    {phase === "form" && (
                      <button
                        type="button"
                        aria-label={`${t("requestPhotoRemove")} ${index + 1}`}
                        onClick={() => removeSlot(slot.key)}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {phase === "form" && slots.length < MAX_FACILITY_PHOTOS && (
                  <li>
                    <label className="ku-request-photo-add">
                      <span>＋ {t("requestPhotoAdd")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="ku-visually-hidden"
                        onChange={(event) => {
                          addFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </li>
                )}
              </ul>
              <p className="ku-request-photos-hint">{t("requestPhotosHint")}</p>
            </div>

            <input
              className="ku-visually-hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />

            {phase === "form" && (
              <TurnstileWidget
                key={widgetKey}
                siteKey={siteKey}
                onToken={setToken}
                onExpire={() => setToken(null)}
              />
            )}

            {errorKey && (
              <p role="alert" className="ku-request-modal-error">
                {t(errorKey)}
              </p>
            )}

            <div className="ku-request-modal-actions">
              <button
                type="button"
                onClick={onClose}
                disabled={phase === "sending"}
              >
                {t("closeLabel")}
              </button>
              {phase === "retry" ? (
                <button
                  type="button"
                  className="ku-request-modal-primary"
                  onClick={() => void uploadPending()}
                >
                  {t("requestRetryPhotos")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ku-request-modal-primary"
                  onClick={() => void submit()}
                  disabled={busy || converting || !token}
                >
                  {busy ? t("requestSubmitting") : t("requestSubmit")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
