// P3.2 — In-browser audio recorder hook using MediaRecorder.
//
// Returns a small state machine: `idle` → `recording` → `idle` (with the
// final Blob exposed via `lastBlob`). The hook handles mic-permission
// acquisition, MIME detection (prefers webm/opus → falls back to mp4),
// and clean teardown of the media tracks when recording stops.
//
// Falls back gracefully when MediaRecorder isn't available (Safari < 14.5,
// some embedded webviews): the hook returns `unsupported: true` and the
// consumer should hide the record button + show a file-upload fallback.

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "error";

export interface UseAudioRecorderResult {
  state: RecorderState;
  error: string | null;
  unsupported: boolean;
  /** Most recently recorded clip; null until the first stop. */
  lastBlob: Blob | null;
  /** Most recent clip duration in seconds (rounded). */
  lastDurationSec: number | null;
  /** File-name hint derived from the active MIME (e.g. "recording.webm"). */
  lastFileName: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  reset: () => void;
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/wav")) return "wav";
  return "webm";
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [lastDurationSec, setLastDurationSec] = useState<number | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const unsupported =
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    !navigator?.mediaDevices?.getUserMedia;

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
  }, []);

  // Safety net: if the component unmounts while recording, release the mic.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (unsupported) {
      setError("Audio recording is not supported in this browser.");
      setState("error");
      return;
    }
    if (state === "recording") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const durationSec = startedAtRef.current
          ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
          : null;
        const fileName = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${extFromMime(finalMime)}`;
        setLastBlob(blob);
        setLastDurationSec(durationSec);
        setLastFileName(fileName);
        setState("idle");
        cleanup();
        const resolver = stopResolveRef.current;
        stopResolveRef.current = null;
        if (resolver) resolver(blob);
      };
      recorder.onerror = (e) => {
        setError(String((e as { error?: { message?: string } }).error?.message ?? "Recorder error"));
        setState("error");
        cleanup();
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start recording";
      setError(msg);
      setState("error");
      cleanup();
    }
  }, [unsupported, state, cleanup]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || state !== "recording") return null;
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, [state]);

  const reset = useCallback(() => {
    setLastBlob(null);
    setLastDurationSec(null);
    setLastFileName(null);
    setError(null);
    setState("idle");
  }, []);

  return { state, error, unsupported, lastBlob, lastDurationSec, lastFileName, start, stop, reset };
}
