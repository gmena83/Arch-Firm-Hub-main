// P3.3 — OpenAI Whisper transcription job.
//
// Triggered by the document-upload route when `type === "audio"` (or any
// future audio-like type). The job is fire-and-forget by design: the upload
// route responds 201 immediately and we update `transcriptStatus` /
// `transcriptText` async via `setImmediate`. Background workers won't
// survive serverless deployments — V2 will swap this for a real queue
// (Upstash QStash or similar), but on Railway/long-running Node the
// in-process queue is fine for the trial volume.
//
// Per the user clarification on 2026-05-13: use OpenAI Whisper. The
// OPENAI_API_KEY is already in `managed-secrets`, so we lazily resolve it
// per call (no env-var caching) — matches the pattern in `routes/ai.ts`.
//
// Spanish projects pass `language: "es"` for higher accuracy on
// Puerto-Rican-accented audio. We detect Spanish via the project's
// default lang OR a heuristic on the file name; default is auto-detect.

import OpenAI from "openai";
import { getManagedSecret } from "./managed-secrets";
import { logger } from "./logger";
import { DOCUMENTS } from "../data/seed";
import { persistDocumentsForProject } from "./lifecycle-persistence";

let _client: { apiKey: string; client: OpenAI } | null = null;

function getOpenAI(): OpenAI | null {
  const apiKey = getManagedSecret("OPENAI_API_KEY");
  if (!apiKey) return null;
  if (_client && _client.apiKey === apiKey) return _client.client;
  _client = { apiKey, client: new OpenAI({ apiKey }) };
  return _client.client;
}

interface TranscribeArgs {
  projectId: string;
  documentId: string;
  /** Raw audio bytes. The route hands us either a Buffer or an ArrayBuffer. */
  audioBytes: Buffer | ArrayBuffer;
  /** File name with extension (e.g. "site-visit-aibonito.webm"). Whisper uses it for MIME detection. */
  fileName: string;
  /** "en" | "es" | undefined (auto-detect). */
  language?: "en" | "es";
}

/**
 * Run Whisper transcription against the audio bytes and update the project_documents
 * row with the resulting text. NEVER throws — every failure is logged + recorded as
 * `transcriptStatus: "error"` on the document row so the UI can render the failure
 * state without the upload route reporting a 500.
 */
export async function transcribeAudio(args: TranscribeArgs): Promise<void> {
  const { projectId, documentId, audioBytes, fileName, language } = args;

  const client = getOpenAI();
  if (!client) {
    await markTranscriptStatus(projectId, documentId, "error", "OPENAI_API_KEY not configured.");
    return;
  }

  try {
    // Mark as pending first so the UI shows "Transcribing..." between the
    // upload-ack and the transcribe-done event.
    await markTranscriptStatus(projectId, documentId, "pending");

    const buf = Buffer.isBuffer(audioBytes) ? audioBytes : Buffer.from(audioBytes);
    // The OpenAI SDK's transcriptions endpoint accepts a File-like object.
    // Construct it from a fresh Uint8Array view of the buffer's bytes —
    // passing Buffer directly is rejected by lib.dom.d.ts on Node 20+
    // because `Buffer<ArrayBufferLike>` and `Uint8Array<ArrayBuffer>` no
    // longer overlap structurally (`SharedArrayBuffer` is part of the
    // Buffer-side union). A direct Uint8Array copy bypasses that.
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    const file = new File([bytes], fileName, { type: guessAudioMime(fileName) });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      ...(language ? { language } : {}),
      response_format: "text",
    });
    // When response_format is "text", the SDK returns a plain string.
    const transcript = typeof result === "string" ? result : String((result as { text?: string }).text ?? "");
    await markTranscriptDone(projectId, documentId, transcript);
    logger.info({ projectId, documentId, chars: transcript.length }, "transcription complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    logger.error({ err, projectId, documentId }, "transcription failed");
    await markTranscriptStatus(projectId, documentId, "error", message);
  }
}

function guessAudioMime(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "webm") return "audio/webm";
  if (ext === "mp3" || ext === "mpeg") return "audio/mpeg";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  return "application/octet-stream";
}

async function markTranscriptStatus(
  projectId: string,
  documentId: string,
  status: "pending" | "done" | "error",
  error?: string,
): Promise<void> {
  const docs = (DOCUMENTS as unknown as Record<string, Array<Record<string, unknown>>>)[projectId] ?? [];
  const doc = docs.find((d) => d["id"] === documentId);
  if (!doc) return;
  doc["transcriptStatus"] = status;
  if (error !== undefined) doc["transcriptError"] = error;
  try {
    await persistDocumentsForProject(projectId);
  } catch (err) {
    logger.warn({ err, projectId, documentId }, "persist transcript status failed");
  }
}

async function markTranscriptDone(
  projectId: string,
  documentId: string,
  transcript: string,
): Promise<void> {
  const docs = (DOCUMENTS as unknown as Record<string, Array<Record<string, unknown>>>)[projectId] ?? [];
  const doc = docs.find((d) => d["id"] === documentId);
  if (!doc) return;
  doc["transcriptText"] = transcript;
  doc["transcriptStatus"] = "done";
  doc["transcriptError"] = undefined;
  try {
    await persistDocumentsForProject(projectId);
  } catch (err) {
    logger.warn({ err, projectId, documentId }, "persist transcript done failed");
  }
}

/**
 * Convenience: enqueue a background transcription. Returns immediately;
 * the actual work runs via `setImmediate`. The route handler should call
 * this AFTER it has responded 201 to the client, OR use `void` if it
 * needs to fire from inside the response path.
 */
export function enqueueTranscription(args: TranscribeArgs): void {
  setImmediate(() => {
    void transcribeAudio(args);
  });
}
