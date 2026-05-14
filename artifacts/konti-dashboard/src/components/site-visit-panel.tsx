// P3.1 + P3.2 + P3.4 — First-class Site Visit panel.
//
// The 2026-05-11 meeting described site visits as the highest-frequency
// team operation. Jorge does multiple a week; the prior modal-only "Log
// site visit" was a thin text-only form that never lived past close. This
// panel is a working pad: visitor + date + channel up top, then a capture
// grid where the team can add photos, audio (with Whisper transcription),
// video, and text notes — each row carrying its own internal-vs-client
// visibility toggle.

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MapPinned,
  Loader2,
  X,
  Camera,
  Mic,
  Square,
  Video,
  FileText,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

interface SiteVisitItem {
  id: string;
  itemType: "photo" | "audio" | "video" | "note";
  documentId?: string;
  noteText?: string;
  clientVisible: boolean;
  createdAt: string;
}

interface SiteVisit {
  id: string;
  projectId: string;
  visitor: string;
  visitDate: string;
  channel: "site" | "remote";
  notes?: string;
  items: SiteVisitItem[];
  createdAt: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
  let token: string | undefined;
  try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function uploadDocument(
  projectId: string,
  args: {
    name: string;
    type: "photo" | "audio" | "video";
    mimeType: string;
    fileBase64: string;
    fileSize: string;
    transcriptLanguage?: "en" | "es";
  },
): Promise<{ id: string }> {
  const res = await authedFetch(`/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...args,
      category: "internal",
      isClientVisible: false,
      ...(args.type === "photo" ? { photoCategory: "site_conditions" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return (await res.json()) as { id: string };
}

function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

interface SiteVisitPanelProps {
  projectId: string;
  /** Default visitor name (pre-populated with the logged-in user). */
  defaultVisitor?: string;
}

export function SiteVisitPanel({ projectId, defaultVisitor }: SiteVisitPanelProps) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);

  // Form state for a new visit
  const [visitor, setVisitor] = useState<string>(defaultVisitor ?? user?.name ?? "");
  const [visitDate, setVisitDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState<"site" | "remote">("site");
  const [creating, setCreating] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const recorder = useAudioRecorder();
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await authedFetch(`/api/projects/${projectId}/site-visits`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { visits: SiteVisit[] };
      setVisits(Array.isArray(data.visits) ? data.visits : []);
    } catch {
      // Surface as empty rather than blocking the UI — non-critical.
      setVisits([]);
    } finally {
      setLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeVisit = visits.find((v) => v.id === activeVisitId) ?? null;

  const createVisit = async () => {
    if (!visitor.trim() || !visitDate.trim()) {
      toast({ title: t("Visitor and date are required", "Visitante y fecha son requeridos"), variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await authedFetch(`/api/projects/${projectId}/site-visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor: visitor.trim(), visitDate, channel, items: [] }),
      });
      if (!res.ok) throw new Error("save_failed");
      const visit = (await res.json()) as SiteVisit;
      setVisits((prev) => [...prev, visit]);
      setActiveVisitId(visit.id);
      toast({ title: t("Site visit started", "Visita iniciada") });
    } catch (err) {
      toast({
        title: t("Could not start visit", "No se pudo iniciar la visita"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const addItem = async (item: {
    itemType: "photo" | "audio" | "video" | "note";
    documentId?: string;
    noteText?: string;
  }) => {
    if (!activeVisit) return;
    const res = await authedFetch(`/api/projects/${projectId}/site-visits/${activeVisit.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error("save_failed");
    const newItem = (await res.json()) as SiteVisitItem;
    setVisits((prev) =>
      prev.map((v) => (v.id === activeVisit.id ? { ...v, items: [...v.items, newItem] } : v)),
    );
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0 || !activeVisit) return;
    const file = files[0]!;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: t("File too large", "Archivo muy grande"), variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await blobToBase64DataUrl(file);
      const doc = await uploadDocument(projectId, {
        name: file.name,
        type: "photo",
        mimeType: file.type || "image/jpeg",
        fileBase64: dataUrl,
        fileSize: `${Math.round(file.size / 1024)} KB`,
      });
      await addItem({ itemType: "photo", documentId: doc.id });
      toast({ title: t("Photo added", "Foto agregada") });
    } catch (err) {
      toast({
        title: t("Could not add photo", "No se pudo agregar la foto"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0 || !activeVisit) return;
    const file = files[0]!;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: t("File too large", "Archivo muy grande"), variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await blobToBase64DataUrl(file);
      const doc = await uploadDocument(projectId, {
        name: file.name,
        type: "video",
        mimeType: file.type || "video/mp4",
        fileBase64: dataUrl,
        fileSize: `${Math.round(file.size / 1024)} KB`,
      });
      await addItem({ itemType: "video", documentId: doc.id });
      toast({ title: t("Video added", "Video agregado") });
    } catch (err) {
      toast({
        title: t("Could not add video", "No se pudo agregar el video"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const toggleRecording = async () => {
    if (!activeVisit) return;
    if (recorder.state === "recording") {
      setUploadingAudio(true);
      try {
        const blob = await recorder.stop();
        if (!blob) {
          setUploadingAudio(false);
          return;
        }
        if (blob.size > MAX_UPLOAD_BYTES) {
          toast({ title: t("Recording too long", "Grabación muy larga"), description: t("Max 10 MB.", "Máx. 10 MB."), variant: "destructive" });
          setUploadingAudio(false);
          return;
        }
        const dataUrl = await blobToBase64DataUrl(blob);
        const name = recorder.lastFileName ?? `recording-${Date.now()}.webm`;
        const doc = await uploadDocument(projectId, {
          name,
          type: "audio",
          mimeType: blob.type || "audio/webm",
          fileBase64: dataUrl,
          fileSize: `${Math.round(blob.size / 1024)} KB`,
          transcriptLanguage: lang === "es" ? "es" : "en",
        });
        await addItem({ itemType: "audio", documentId: doc.id });
        toast({
          title: t("Audio added — transcribing…", "Audio agregado — transcribiendo…"),
          description: t("Transcript will appear shortly.", "La transcripción aparecerá en breve."),
        });
      } catch (err) {
        toast({
          title: t("Could not save recording", "No se pudo guardar la grabación"),
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      } finally {
        setUploadingAudio(false);
        recorder.reset();
      }
    } else {
      await recorder.start();
    }
  };

  const addNote = async () => {
    if (!activeVisit || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await addItem({ itemType: "note", noteText: noteText.trim() });
      setNoteText("");
      toast({ title: t("Note added", "Nota agregada") });
    } catch (err) {
      toast({
        title: t("Could not save note", "No se pudo guardar la nota"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  };

  const toggleItemVisibility = async (item: SiteVisitItem) => {
    if (!activeVisit) return;
    const next = !item.clientVisible;
    try {
      const res = await authedFetch(
        `/api/projects/${projectId}/site-visits/${activeVisit.id}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientVisible: next }),
        },
      );
      if (!res.ok) throw new Error("toggle_failed");
      setVisits((prev) =>
        prev.map((v) =>
          v.id !== activeVisit.id
            ? v
            : { ...v, items: v.items.map((i) => (i.id === item.id ? { ...i, clientVisible: next } : i)) },
        ),
      );
    } catch {
      toast({ title: t("Could not toggle visibility", "No se pudo cambiar la visibilidad"), variant: "destructive" });
    }
  };

  // Render
  return (
    <section className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="site-visit-panel">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <MapPinned className="w-5 h-5 text-konti-olive" />
          {t("Site Visits", "Visitas al Sitio")}
          <span className="text-xs text-muted-foreground font-normal">({visits.length})</span>
        </h2>
      </header>

      {/* New-visit form */}
      <div className="bg-konti-dark/95 text-konti-light rounded-lg p-4 mb-4 border border-konti-olive/40">
        <p className="text-xs font-bold uppercase tracking-wider text-konti-olive mb-3">
          {t("Start a new visit", "Iniciar una visita")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <label className="block">
            <span className="text-xs font-semibold text-white/70 block mb-1">
              {t("Visitor", "Visitante")}
            </span>
            <input
              type="text"
              value={visitor}
              onChange={(e) => setVisitor(e.target.value)}
              data-testid="site-visit-visitor"
              className="w-full px-3 py-2 rounded-md bg-konti-light text-konti-dark text-sm font-medium"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-white/70 block mb-1">{t("Date", "Fecha")}</span>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              data-testid="site-visit-date"
              className="w-full px-3 py-2 rounded-md bg-konti-light text-konti-dark text-sm font-medium"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-white/70 block mb-1">{t("Channel", "Canal")}</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "site" | "remote")}
              data-testid="site-visit-channel"
              className="w-full px-3 py-2 rounded-md bg-konti-light text-konti-dark text-sm font-medium"
            >
              <option value="site">{t("On-site", "En sitio")}</option>
              <option value="remote">{t("Remote check", "Revisión remota")}</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={createVisit}
          disabled={creating}
          data-testid="btn-create-site-visit"
          className="w-full md:w-auto px-4 py-2 rounded-md bg-konti-olive text-white text-sm font-bold hover:bg-konti-olive/90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("Start visit + open capture pad", "Iniciar visita + abrir panel")}
        </button>
      </div>

      {/* Active visit's capture pad */}
      {activeVisit && (
        <div className="border border-konti-olive rounded-lg p-4 mb-4 bg-konti-olive/5" data-testid={`active-visit-${activeVisit.id}`}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-sm text-konti-dark">
              {activeVisit.visitor} · {activeVisit.visitDate}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({activeVisit.channel === "site" ? t("on-site", "en sitio") : t("remote", "remota")})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setActiveVisitId(null)}
              aria-label={t("Close pad", "Cerrar panel")}
              className="text-muted-foreground hover:text-foreground"
              data-testid="btn-close-active-visit"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Capture buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <label
              htmlFor="sv-photo-input"
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-card border border-border text-xs font-semibold cursor-pointer hover:border-konti-olive transition-colors"
              data-testid="btn-sv-add-photo"
            >
              <Camera className="w-4 h-4 text-konti-olive" />
              {t("Photo", "Foto")}
              <input id="sv-photo-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
            </label>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={uploadingAudio || recorder.unsupported}
              data-testid="btn-sv-record-audio"
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                recorder.state === "recording"
                  ? "bg-red-500 text-white border border-red-600 animate-pulse"
                  : "bg-card border border-border hover:border-konti-olive disabled:opacity-50"
              }`}
              aria-label={recorder.state === "recording" ? t("Stop recording", "Detener grabación") : t("Start recording", "Iniciar grabación")}
            >
              {recorder.state === "recording" ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4 text-konti-olive" />}
              {uploadingAudio
                ? t("Saving…", "Guardando…")
                : recorder.state === "recording"
                  ? t("Stop", "Detener")
                  : t("Audio", "Audio")}
            </button>
            <label
              htmlFor="sv-video-input"
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-card border border-border text-xs font-semibold cursor-pointer hover:border-konti-olive transition-colors"
              data-testid="btn-sv-add-video"
            >
              <Video className="w-4 h-4 text-konti-olive" />
              {t("Video", "Video")}
              <input id="sv-video-input" type="file" accept="video/*" capture="environment" className="hidden" onChange={onPickVideo} />
            </label>
            <button
              type="button"
              onClick={() => {
                const next = window.prompt(t("Note text:", "Texto de la nota:"), "");
                if (next && next.trim()) {
                  setNoteText(next.trim());
                  void addNote();
                }
              }}
              data-testid="btn-sv-add-note"
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-card border border-border text-xs font-semibold hover:border-konti-olive transition-colors disabled:opacity-50"
              disabled={savingNote}
            >
              <FileText className="w-4 h-4 text-konti-olive" />
              {t("Note", "Nota")}
            </button>
          </div>

          {recorder.unsupported && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2" data-testid="sv-recorder-unsupported">
              {t(
                "In-browser recording isn't supported here. Use the Audio file picker instead.",
                "La grabación en navegador no funciona aquí. Usa el selector de Audio.",
              )}
            </p>
          )}
          {recorder.error && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">
              {recorder.error}
            </p>
          )}

          {/* Items list */}
          {activeVisit.items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {t("No items yet. Add a photo, audio, video, or note above.", "Sin elementos. Agrega arriba.")}
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md bg-card" data-testid="site-visit-items">
              {activeVisit.items.map((item) => (
                <li
                  key={item.id}
                  data-testid={`sv-item-${item.id}`}
                  className="flex items-start gap-3 px-3 py-2"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 mt-0.5">
                    {item.itemType}
                  </span>
                  <div className="flex-1 min-w-0 text-xs">
                    {item.noteText ? (
                      <p className="text-foreground whitespace-pre-wrap break-words">{item.noteText}</p>
                    ) : (
                      <p className="text-muted-foreground">
                        {t("Document", "Documento")}: <span className="font-mono">{item.documentId}</span>
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleItemVisibility(item)}
                    aria-label={
                      item.clientVisible
                        ? t("Make internal-only", "Hacer solo interno")
                        : t("Make client-visible", "Hacer visible al cliente")
                    }
                    title={
                      item.clientVisible
                        ? t("Visible to client", "Visible al cliente")
                        : t("Internal only", "Solo interno")
                    }
                    data-testid={`btn-sv-toggle-${item.id}`}
                    className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border ${
                      item.clientVisible
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.clientVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {item.clientVisible ? t("Client", "Cliente") : t("Internal", "Interno")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Visit history */}
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {t("Recent visits", "Visitas recientes")}
        </h3>
        {loadingList ? (
          <p className="text-xs text-muted-foreground">{t("Loading…", "Cargando…")}</p>
        ) : visits.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("No visits yet.", "Sin visitas todavía.")}</p>
        ) : (
          <ul className="space-y-1" data-testid="site-visit-list">
            {visits.slice().reverse().slice(0, 10).map((v) => (
              <li key={v.id} data-testid={`sv-row-${v.id}`}>
                <button
                  type="button"
                  onClick={() => setActiveVisitId(v.id)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-md border transition-colors ${
                    v.id === activeVisitId
                      ? "border-konti-olive bg-konti-olive/10"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <span className="font-semibold">{v.visitor}</span> · {v.visitDate} · {v.channel}
                  <span className="ml-2 text-muted-foreground">
                    {v.items.length} {t("item(s)", "ítem(s)")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
