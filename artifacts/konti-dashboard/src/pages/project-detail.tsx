import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProjectChangeOrders } from "@workspace/api-client-react";
import {
  useGetProject,
  useGetProjectTasks,
  useGetProjectWeather,
  useGetProjectDocuments,
  useGetProjectCalculations,
  useCreateProjectDocument,
  useDeleteProjectDocument,
  useUpdateProjectDocument,
  useUpdateProjectClientContact,
  useAppendProjectDocumentVersion,
  getGetProjectQueryKey,
  getGetProjectTasksQueryKey,
  getGetProjectWeatherQueryKey,
  getGetProjectDocumentsQueryKey,
  getGetProjectCalculationsQueryKey,
  type Document,
  type WeatherHistoryEntry,
} from "@workspace/api-client-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { WeatherBadge } from "@/components/weather-badge";
import { PreDesignPanel } from "@/components/pre-design-panel";
import { DesignPanel } from "@/components/design-panel";
import { ProposalsPanel } from "@/components/proposals-panel";
import { ChangeOrdersPanel } from "@/components/change-orders-panel";
import PermitsPanel from "@/components/permits-panel";
import { CostPlusBudget } from "@/components/cost-plus-budget";
import { ProjectInvoices } from "@/components/project-invoices";
import { ClientActivityCard } from "@/components/client-activity-card";
import { ProjectTeamActions } from "@/components/project-team-actions";
import { StatusSentence } from "@/components/status-sentence";
import { SitePhotosGallery, PHOTO_CATEGORY_OPTIONS, type PhotoCategoryKey } from "@/components/site-photos-gallery";
import { SiteVisitPanel } from "@/components/site-visit-panel";
import { ContractorMonitoringPanel } from "@/components/contractor-monitoring-panel";
import { ContractorMonitoringSection } from "@/components/contractor-monitoring-section";
import { ProjectMetadataCard } from "@/components/project-metadata-card";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";
import { InspectionsSection } from "@/components/inspections-section";
import { PunchlistPanel } from "@/components/punchlist-panel";
import { MilestonesTimeline } from "@/components/milestones-timeline";
import {
  MapPin, Users, FileText, Upload, Upload as UploadIcon, Check, Clock, ChevronLeft,
  Wind, Droplets, Thermometer, Eye, EyeOff, ArrowRight, X,
  ChevronDown, ChevronUp, BarChart2, History, Trash2, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Maximum upload size accepted by the modal. Mirrors the demo policy
// documented in `attached_assets/reports/critical-feedback-priorities.csv`
// row #82 (Tatiana — "no me deja upload nada"). The server registers
// metadata only, so this is a UX guard to block oversized payloads early.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".pptx"];

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferDocType(file: File): "pdf" | "excel" | "pptx" | "photo" | "other" {
  if (file.type === "application/pdf" || fileExtension(file.name) === ".pdf") return "pdf";
  if (file.type.startsWith("image/")) return "photo";
  const ext = fileExtension(file.name);
  if (ext === ".xls" || ext === ".xlsx") return "excel";
  if (ext === ".pptx") return "pptx";
  return "other";
}

// Document categories — drives the upload picker (#80) and grouped list (#11).
type DocCategory =
  | "client_review" | "internal" | "permits" | "construction" | "design"
  | "contratos" | "acuerdos_compra" | "otros";

const DOC_CATEGORY_OPTIONS: Array<{ key: DocCategory; label: string; labelEs: string }> = [
  { key: "contratos",       label: "Contracts",         labelEs: "Contratos" },
  { key: "acuerdos_compra", label: "Purchase Agreements", labelEs: "Acuerdos de compra" },
  { key: "client_review",   label: "Client Review",     labelEs: "Revisión del Cliente" },
  { key: "internal",        label: "Internal",          labelEs: "Interno" },
  { key: "permits",         label: "Permits",           labelEs: "Permisos" },
  { key: "construction",    label: "Construction",      labelEs: "Construcción" },
  { key: "design",          label: "Design",            labelEs: "Diseño" },
  { key: "otros",           label: "Other",             labelEs: "Otros" },
];

const DOC_CATEGORY_COLORS: Record<string, string> = {
  client_review:   "bg-sky-100 text-sky-800",
  internal:        "bg-purple-100 text-purple-800",
  permits:         "bg-amber-100 text-amber-800",
  construction:    "bg-orange-100 text-orange-800",
  design:          "bg-indigo-100 text-indigo-800",
  contratos:       "bg-emerald-100 text-emerald-800",
  acuerdos_compra: "bg-rose-100 text-rose-800",
  otros:           "bg-gray-100 text-gray-700",
};

function categoryLabel(cat: string, lang: "en" | "es"): string {
  const opt = DOC_CATEGORY_OPTIONS.find((o) => o.key === cat);
  if (opt) return lang === "es" ? opt.labelEs : opt.label;
  return cat;
}

// Top-level groups for the project Documents card (#11). Anything that is
// not a contract or purchase agreement falls under "Otros".
type DocGroupKey = "contratos" | "acuerdos_compra" | "otros";
const DOC_GROUPS: Array<{ key: DocGroupKey; label: string; labelEs: string }> = [
  { key: "contratos",       label: "Contracts",           labelEs: "Contratos" },
  { key: "acuerdos_compra", label: "Purchase Agreements", labelEs: "Acuerdos de compra" },
  { key: "otros",           label: "Other",               labelEs: "Otros" },
];
function groupForCategory(cat: string): DocGroupKey {
  if (cat === "contratos") return "contratos";
  if (cat === "acuerdos_compra") return "acuerdos_compra";
  return "otros";
}

function UploadModal({
  onClose,
  projectId,
  lockedToClientReview = false,
}: {
  onClose: () => void;
  projectId: string;
  lockedToClientReview?: boolean;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<DocCategory>("client_review");
  // Photo-only fields (#105). Caption is shared across a multi-file upload —
  // the team can upload a batch of "Week 32 framing" shots with one caption
  // and category instead of editing each one individually.
  const [photoCategory, setPhotoCategory] = useState<PhotoCategoryKey>("construction_progress");
  const [caption, setCaption] = useState("");
  // When true, the next picked file batch is uploaded as photos (multi-file
  // <input> + photoCategory required). The dropzone changes its accept hint
  // accordingly.
  const [photoMode, setPhotoMode] = useState(false);
  // Photo internal-only toggle (#105 review feedback). Defaults to client-
  // visible because that's the common case; the team can flip this to keep
  // a punchlist-evidence shot internal at upload time.
  const [photoInternalOnly, setPhotoInternalOnly] = useState(false);
  // P2.4 — "Send to punchlist" toggle. When set, the photo gets the
  // goesToPunchlist=true flag on its document row so the punchlist panel
  // renders it as evidence. Per the 2026-05-11 meeting: "Implementar
  // dropdowns para categorizar la foto y determinar si debe ir al punchlist."
  const [photoGoesToPunchlist, setPhotoGoesToPunchlist] = useState(false);
  // P2.5 — alternate upload modes for audio/video/note. These render under
  // the main mode toggle so the team can capture site-visit attachments
  // without leaving the project page.
  const [extraMode, setExtraMode] = useState<"audio" | "video" | "note" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Per-session "Just uploaded" log (Task #64). Holds the Document objects
  // returned by the create mutation in upload order (oldest first → newest
  // last). State is component-local so it resets every time the dialog is
  // re-opened — this is intentionally a session log, not a persistent feed.
  const [recentlyUploaded, setRecentlyUploaded] = useState<Document[]>([]);
  // Tracks which documents are mid-delete so the Remove button can show a
  // disabled/“Removing…” state instead of letting the user click twice.
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const createDocument = useCreateProjectDocument();
  const deleteDocument = useDeleteProjectDocument();

  const uploadFile = useCallback(
    async (file: File, isPhotoBatch: boolean) => {
      // Client-side guards: bilingual error toast on validation failure,
      // matching the bug-report row #82 acceptance criteria.
      const ext = fileExtension(file.name);
      const mimeOk = ACCEPTED_MIME.has(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
      if (!mimeOk) {
        toast({
          title: t("Unsupported file type", "Tipo de archivo no compatible"),
          description: t(
            "Allowed: PDF, JPG, PNG, Excel, PPTX.",
            "Permitidos: PDF, JPG, PNG, Excel, PPTX.",
          ),
          variant: "destructive",
        });
        return false;
      }
      // In photo-batch mode, reject non-images outright so users don't
      // accidentally drop a PDF in the photos dropzone.
      if (isPhotoBatch && inferDocType(file) !== "photo") {
        toast({
          title: t("Photos only", "Solo fotos"),
          description: t(
            "Use the regular Documents upload for non-image files.",
            "Usa la subida de Documentos para archivos que no sean imágenes.",
          ),
          variant: "destructive",
        });
        return false;
      }
      // Conversely, in Document mode reject images so they can't silently
      // sneak into the doc list with a default photoCategory. The team must
      // switch to Site Photo(s) mode to pick a real category and caption.
      if (!isPhotoBatch && !lockedToClientReview && inferDocType(file) === "photo") {
        toast({
          title: t("Switch to Site Photo(s) mode", "Cambia a modo Foto(s) del Sitio"),
          description: t(
            "Image files must be uploaded as Site Photos so they get a category and appear in the gallery.",
            "Las imágenes deben subirse como Fotos del Sitio para asignarles una categoría y aparecer en la galería.",
          ),
          variant: "destructive",
        });
        return false;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: t("File too large", "Archivo muy grande"),
          description: t(
            `Maximum size is 10 MB. This file is ${formatFileSize(file.size)}.`,
            `El tamaño máximo es 10 MB. Este archivo pesa ${formatFileSize(file.size)}.`,
          ),
          variant: "destructive",
        });
        return false;
      }
      const docType = inferDocType(file);
      const isPhoto = docType === "photo";
      const effectiveCategory: DocCategory = lockedToClientReview
        ? "client_review"
        : isPhoto
          ? "construction"
          : category;
      // For photo uploads, read the file as a base64 data URL on the client
      // and persist it as `imageUrl` so the gallery/lightbox/report can render
      // the actual image without needing object storage. This mirrors the
      // in-memory backend pattern used elsewhere in the demo and avoids the
      // placeholder-thumbnail bug flagged in the #105 code review.
      let dataUrl: string | undefined;
      if (isPhoto) {
        try {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("read failed"));
            reader.readAsDataURL(file);
          });
        } catch {
          toast({
            title: t("Could not read photo", "No se pudo leer la foto"),
            description: t("The image file could not be read in this browser.", "El navegador no pudo leer el archivo."),
            variant: "destructive",
          });
          return false;
        }
      }
      const isVisibleToClient = lockedToClientReview
        ? true
        : isPhoto
          ? !photoInternalOnly
          : effectiveCategory === "client_review";
      try {
        const created = await createDocument.mutateAsync({
          projectId,
          data: {
            name: file.name,
            category: effectiveCategory,
            type: docType,
            isClientVisible: isVisibleToClient,
            fileSize: formatFileSize(file.size),
            mimeType: file.type || "application/octet-stream",
            ...(isPhoto ? { photoCategory } : {}),
            ...(isPhoto && caption.trim() ? { caption: caption.trim() } : {}),
            ...(dataUrl ? { imageUrl: dataUrl } : {}),
            // P2.4 — punchlist evidence toggle. Cast through `as never` because
            // the codegen'd type doesn't yet include this optional field; the
            // server accepts it (see routes/projects.ts /documents body shape).
            ...(isPhoto && photoGoesToPunchlist ? ({ goesToPunchlist: true } as never) : {}),
          },
        });
        return created;
      } catch (err) {
        // Bilingual destructive toast keyed by HTTP status.
        const status = (err as { status?: number }).status;
        const serverMsg = (err as { data?: { message?: string } }).data?.message;
        let descEn = "Could not register the document. Please try again.";
        let descEs = "No se pudo registrar el documento. Inténtalo de nuevo.";
        if (status === 404) {
          descEn = "Project not found on the server. Refresh and try again.";
          descEs = "El proyecto no existe en el servidor. Recarga e inténtalo de nuevo.";
        } else if (status === 403) {
          descEn = "Your role cannot upload documents to this project.";
          descEs = "Tu rol no puede subir documentos a este proyecto.";
        } else if (status === 401) {
          descEn = "Session expired. Please sign in again.";
          descEs = "Sesión expirada. Inicia sesión nuevamente.";
        } else if (status === 400) {
          descEn = serverMsg ?? "The file could not be accepted by the server.";
          descEs = "El servidor rechazó el archivo. Verifica el nombre y la categoría.";
        }
        toast({
          title: t("Upload failed", "No se pudo subir el archivo"),
          description: t(descEn, descEs),
          variant: "destructive",
        });
        return null;
      }
    },
    [createDocument, projectId, category, photoCategory, caption, photoInternalOnly, photoGoesToPunchlist, lockedToClientReview, toast, t],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[], isPhotoBatch: boolean) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const created: Document[] = [];
      for (const file of list) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await uploadFile(file, isPhotoBatch);
        if (doc) created.push(doc);
      }
      if (created.length > 0) {
        // Append in upload order so the panel mirrors the timeline; the UI
        // renders newest-first via slice().reverse() below.
        setRecentlyUploaded((prev) => [...prev, ...created]);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) }),
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
        ]);
        toast({
          title: isPhotoBatch
            ? t(
                created.length === 1 ? "Photo uploaded" : `${created.length} photos uploaded`,
                created.length === 1 ? "Foto subida" : `${created.length} fotos subidas`,
              )
            : t("File uploaded successfully", "Archivo subido exitosamente"),
          description: isPhotoBatch
            ? t("Visible in the Site Photos gallery.", "Visibles en la galería de Fotos del Sitio.")
            : (lockedToClientReview ? "client_review" : category) === "client_review"
              ? t("Email notification sent to client.", "Notificación enviada al cliente por correo.")
              : t("File saved to internal documents.", "Archivo guardado en documentos internos."),
        });
        // NOTE: Task #64 — the dialog stays open after a successful upload so
        // the user can see the "Just uploaded" panel and remove a wrong file
        // before closing. Closing is now an explicit action (X / Done button).
      }
    },
    [uploadFile, queryClient, projectId, toast, t, lockedToClientReview, category],
  );

  const handleRemoveRecent = useCallback(
    async (doc: Document) => {
      // Optimistic remove with rollback on failure (#64). The user expects
      // the row to disappear instantly because the dialog is modal — slow
      // network feedback would feel broken. We capture only the original
      // index for this single doc (not a whole-array snapshot) so concurrent
      // removes/uploads can't clobber each other on rollback.
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.add(doc.id);
        return next;
      });
      const originalIndex = recentlyUploaded.findIndex((d) => d.id === doc.id);
      setRecentlyUploaded((prev) => prev.filter((d) => d.id !== doc.id));
      try {
        await deleteDocument.mutateAsync({ projectId, documentId: doc.id });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) }),
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
        ]);
        toast({
          title: t("File removed", "Archivo eliminado"),
          description: t(
            `“${doc.name}” was removed from this project.`,
            `“${doc.name}” fue eliminado del proyecto.`,
          ),
        });
      } catch (err) {
        // Roll back the optimistic state by re-inserting only this doc at
        // (approximately) its original position. Using a functional updater
        // avoids clobbering any uploads/deletes that completed in the
        // meantime. If the doc was already re-added (race), the dedupe
        // guard keeps the list unique.
        setRecentlyUploaded((prev) => {
          if (prev.some((d) => d.id === doc.id)) return prev;
          const next = prev.slice();
          const insertAt = Math.min(
            originalIndex >= 0 ? originalIndex : next.length,
            next.length,
          );
          next.splice(insertAt, 0, doc);
          return next;
        });
        const status = (err as { status?: number }).status;
        let descEn = "Could not remove the file. Please try again.";
        let descEs = "No se pudo eliminar el archivo. Inténtalo de nuevo.";
        if (status === 403) {
          descEn = "Your role cannot remove this file.";
          descEs = "Tu rol no puede eliminar este archivo.";
        } else if (status === 404) {
          descEn = "The file no longer exists on the server.";
          descEs = "El archivo ya no existe en el servidor.";
        } else if (status === 401) {
          descEn = "Session expired. Please sign in again.";
          descEs = "Sesión expirada. Inicia sesión nuevamente.";
        }
        toast({
          title: t("Remove failed", "No se pudo eliminar"),
          description: t(descEn, descEs),
          variant: "destructive",
        });
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(doc.id);
          return next;
        });
      }
    },
    [recentlyUploaded, deleteDocument, queryClient, projectId, toast, t],
  );

  // H-2 — replace `void handleFiles(...)` with a proper async caller that
  // surfaces any uncaught error as a toast rather than swallowing it.
  // The previous fire-and-forget pattern could show "success" in the UI
  // when the upload actually threw post-mutation.
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    try {
      await handleFiles(files, photoMode);
    } catch (err) {
      toast({
        title: t("Upload failed", "Falló la subida"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const onDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    try {
      await handleFiles(files, photoMode);
    } catch (err) {
      toast({
        title: t("Upload failed", "Falló la subida"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  // P2.5 — pick handler for the audio / video / note alt modes. Reuses the
  // same backend POST /documents endpoint with type=audio|video; server
  // auto-triggers Whisper transcription for audio uploads.
  const onPickExtra = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "audio" | "video",
  ) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    const file = files[0]!;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: t("File too large", "Archivo muy grande"),
        description: t(`Maximum size is 10 MB.`, "El tamaño máximo es 10 MB."),
        variant: "destructive",
      });
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
      let token: string | undefined;
      try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const lang = (typeof window !== "undefined" && window.localStorage.getItem("konti_lang")) === "es" ? "es" : "en";
      const res = await fetch(`${base}/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          type,
          category: "internal",
          isClientVisible: false,
          fileSize: formatFileSize(file.size),
          mimeType: file.type || "application/octet-stream",
          fileBase64: dataUrl,
          ...(type === "audio" ? { transcriptLanguage: lang } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const created = await res.json();
      setRecentlyUploaded((prev) => [...prev, created as Document]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      ]);
      toast({
        title: type === "audio"
          ? t("Audio uploaded — transcribing…", "Audio subido — transcribiendo…")
          : t("Video uploaded", "Video subido"),
        description: type === "audio"
          ? t("Transcript will appear on the document in ~30s.", "La transcripción aparecerá en el documento en ~30s.")
          : undefined,
      });
    } catch (err) {
      toast({
        title: t("Upload failed", "Falló la subida"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  // P2.5 — text note submit. No file payload; the note is sent inline.
  const submitNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
      let token: string | undefined;
      try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: `Note ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
          type: "note",
          category: "internal",
          isClientVisible: false,
          fileSize: `${text.length} chars`,
          mimeType: "text/plain",
          noteText: text,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const created = await res.json();
      setRecentlyUploaded((prev) => [...prev, created as Document]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      ]);
      toast({ title: t("Note saved", "Nota guardada") });
      setNoteText("");
      setExtraMode(null);
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

  const isUploading = createDocument.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="upload-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{t("Upload Document", "Subir Documento")}</h2>
          <button onClick={onClose} data-testid="btn-close-upload" disabled={isUploading}><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {!lockedToClientReview && (
            <div className="flex rounded-md border border-input overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setPhotoMode(false)}
                disabled={isUploading}
                data-testid="btn-mode-document"
                className={`flex-1 py-2 transition-colors ${
                  !photoMode
                    ? "bg-konti-olive text-white"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {t("Document", "Documento")}
              </button>
              <button
                type="button"
                onClick={() => setPhotoMode(true)}
                disabled={isUploading}
                data-testid="btn-mode-photo"
                className={`flex-1 py-2 transition-colors ${
                  photoMode
                    ? "bg-konti-olive text-white"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {t("Site Photo(s)", "Foto(s) del Sitio")}
              </button>
            </div>
          )}

          {photoMode && !lockedToClientReview ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">{t("Photo Category", "Categoría de Foto")}</label>
                <select
                  value={photoCategory}
                  onChange={(e) => setPhotoCategory(e.target.value as PhotoCategoryKey)}
                  data-testid="select-photo-category"
                  disabled={isUploading}
                  className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {PHOTO_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key} data-testid={`option-photo-category-${opt.key}`}>
                      {t(opt.label, opt.labelEs)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t("Caption", "Descripción")}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{t("(optional)", "(opcional)")}</span>
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, 500))}
                  data-testid="input-photo-caption"
                  disabled={isUploading}
                  maxLength={500}
                  placeholder={t("e.g. Pool excavation week 32", "ej. Excavación de piscina semana 32")}
                  className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[11px] text-muted-foreground mt-1">{caption.length}/500</p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={photoInternalOnly}
                  onChange={(e) => setPhotoInternalOnly(e.target.checked)}
                  data-testid="checkbox-photo-internal-only"
                  disabled={isUploading}
                  className="mt-0.5 accent-konti-olive"
                />
                <span>
                  <span className="font-medium">{t("Internal only", "Solo interno")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "Hide from the client gallery and report.",
                      "Ocultar de la galería y el reporte del cliente.",
                    )}
                  </span>
                </span>
              </label>
              {/* P2.4 — punchlist evidence toggle. Per the meeting:
                  "menús desplegables para categorizar la foto y determinar
                  si debe ir al punchlist." */}
              <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={photoGoesToPunchlist}
                  onChange={(e) => setPhotoGoesToPunchlist(e.target.checked)}
                  data-testid="checkbox-photo-goes-to-punchlist"
                  disabled={isUploading}
                  className="mt-0.5 accent-konti-olive"
                />
                <span>
                  <span className="font-medium">{t("Send to punchlist evidence", "Enviar a evidencia del punchlist")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "Also display this photo in the punchlist panel.",
                      "También mostrar esta foto en el panel del punchlist.",
                    )}
                  </span>
                </span>
              </label>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">{t("Category", "Categoría")}</label>
              {lockedToClientReview ? (
                <div
                  data-testid="locked-category-client-review"
                  className="py-2 px-3 rounded-md text-sm font-medium border bg-konti-olive text-white border-konti-olive flex items-center justify-between"
                >
                  <span>{t("Client Review", "Revisión del Cliente")}</span>
                  <span className="text-[11px] uppercase tracking-wider opacity-80">
                    {t("Locked", "Bloqueado")}
                  </span>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocCategory)}
                  data-testid="select-doc-category"
                  disabled={isUploading}
                  className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {DOC_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key} data-testid={`option-category-${opt.key}`}>
                      {t(opt.label, opt.labelEs)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            data-testid="input-upload-file"
            accept={photoMode ? "image/*" : ACCEPTED_EXTENSIONS.join(",")}
            multiple={photoMode}
            onChange={onPickFile}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isUploading) fileInputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropFile}
            data-testid="upload-dropzone"
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-konti-olive bg-konti-olive/5" : "border-border hover:border-konti-olive/50"
            } ${isUploading ? "opacity-50 cursor-wait" : ""}`}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              {isUploading
                ? t("Uploading…", "Subiendo…")
                : photoMode
                  ? t("Drop photos here or click to browse", "Suelta fotos aquí o haz clic para navegar")
                  : t("Drop a file here or click to browse", "Suelta un archivo aquí o haz clic para navegar")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {photoMode
                ? t("JPG, PNG · multiple files allowed · max 10 MB each", "JPG, PNG · varios archivos permitidos · máx. 10 MB c/u")
                : t("PDF, JPG, PNG, Excel, PPTX · max 10 MB", "PDF, JPG, PNG, Excel, PPTX · máx. 10 MB")}
            </p>
          </div>

          {!photoMode && category === "client_review" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {t("Client will receive an email notification when files are added to Client Review.", "El cliente recibirá una notificación por correo al agregar archivos a Revisión del Cliente.")}
            </p>
          )}

          <button
            onClick={() => !isUploading && fileInputRef.current?.click()}
            data-testid={photoMode ? "btn-upload-photo" : "btn-pick-upload"}
            disabled={isUploading}
            className="w-full py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-60"
          >
            {isUploading
              ? t("Uploading…", "Subiendo…")
              : photoMode
                ? t("Choose Photos", "Elegir Fotos")
                : t("Choose File", "Elegir Archivo")}
          </button>

          {/* P2.5 — Audio / Video / Text Note quick-add chips. Per the
              2026-05-11 meeting: "Implementar botones para subir audio,
              video y texto." Each opens its own picker / inline editor. */}
          {!lockedToClientReview && (
            <div className="border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                {t("Or add other media", "O agregar otro tipo")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label
                  htmlFor="upload-audio-input"
                  className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border border-konti-olive/40 text-konti-olive text-xs font-semibold cursor-pointer hover:bg-konti-olive/10 transition-colors"
                  data-testid="btn-upload-audio"
                >
                  <span aria-hidden="true">🎙️</span>
                  {t("Audio", "Audio")}
                  <input
                    id="upload-audio-input"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => onPickExtra(e, "audio")}
                  />
                </label>
                <label
                  htmlFor="upload-video-input"
                  className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border border-konti-olive/40 text-konti-olive text-xs font-semibold cursor-pointer hover:bg-konti-olive/10 transition-colors"
                  data-testid="btn-upload-video"
                >
                  <span aria-hidden="true">🎥</span>
                  {t("Video", "Video")}
                  <input
                    id="upload-video-input"
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => onPickExtra(e, "video")}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setExtraMode(extraMode === "note" ? null : "note")}
                  data-testid="btn-upload-note"
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-semibold transition-colors ${
                    extraMode === "note"
                      ? "bg-konti-olive text-white border-konti-olive"
                      : "border-konti-olive/40 text-konti-olive hover:bg-konti-olive/10"
                  }`}
                >
                  <span aria-hidden="true">📝</span>
                  {t("Note", "Nota")}
                </button>
              </div>
              {extraMode === "note" && (
                <div className="mt-3 space-y-2" data-testid="extra-note-form">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value.slice(0, 5000))}
                    rows={4}
                    maxLength={5000}
                    disabled={savingNote}
                    placeholder={t("Type a note (max 5000 chars)…", "Escribe una nota (máx. 5000 caracteres)…")}
                    data-testid="textarea-extra-note"
                    className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-konti-olive/50"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{noteText.length}/5000</span>
                    <button
                      type="button"
                      onClick={submitNote}
                      disabled={savingNote || noteText.trim().length === 0}
                      data-testid="btn-save-extra-note"
                      className="px-3 py-1.5 bg-konti-olive text-white rounded-md text-xs font-semibold disabled:opacity-50 hover:bg-konti-olive/90 transition-colors"
                    >
                      {savingNote ? t("Saving…", "Guardando…") : t("Save Note", "Guardar Nota")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {recentlyUploaded.length > 0 && (
            <div
              data-testid="recent-uploads-panel"
              className="border border-border rounded-md bg-muted/30 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(
                    `Just uploaded (${recentlyUploaded.length})`,
                    `Recién subidos (${recentlyUploaded.length})`,
                  )}
                </h3>
              </div>
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {recentlyUploaded
                  .slice()
                  .reverse()
                  .map((doc) => {
                    const isRemoving = removingIds.has(doc.id);
                    const badgeColor = DOC_CATEGORY_COLORS[doc.category] ?? "bg-gray-100 text-gray-700";
                    return (
                      <li
                        key={doc.id}
                        data-testid={`recent-upload-row-${doc.id}`}
                        className={`flex items-center gap-3 bg-card border border-card-border rounded-md p-2 transition-opacity ${
                          isRemoving ? "opacity-60" : ""
                        }`}
                      >
                        {doc.imageUrl ? (
                          <img
                            src={doc.imageUrl}
                            alt={doc.name}
                            className="w-10 h-10 rounded object-cover shrink-0 border border-border"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0 border border-border">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium text-foreground truncate"
                            title={doc.name}
                            data-testid={`recent-upload-name-${doc.id}`}
                          >
                            {doc.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColor}`}
                              data-testid={`recent-upload-category-${doc.id}`}
                            >
                              {categoryLabel(doc.category, lang)}
                            </span>
                            <span className="text-xs text-muted-foreground">{doc.fileSize}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveRecent(doc)}
                          disabled={isRemoving || isUploading}
                          data-testid={`btn-remove-recent-${doc.id}`}
                          aria-label={t(`Remove ${doc.name}`, `Eliminar ${doc.name}`)}
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isRemoving
                            ? t("Removing…", "Eliminando…")
                            : t("Remove", "Eliminar")}
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading || removingIds.size > 0}
                data-testid="btn-done-upload"
                className="w-full py-2 bg-card hover:bg-muted text-sm font-medium rounded-md border border-border transition-colors disabled:opacity-60"
              >
                {t("Done", "Listo")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmojiDayTick({ x, y, payload, chartData }: { x?: number; y?: number; payload?: { value: string }; chartData: Array<{ day: string; emoji: string }> }) {
  const entry = chartData.find((d) => d.day === payload?.value);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fontSize={10} fill="currentColor" className="fill-muted-foreground">{payload?.value}</text>
      <text x={0} y={0} dy={30} textAnchor="middle" fontSize={13}>{entry?.emoji ?? ""}</text>
    </g>
  );
}

function WeatherHistoryChart({ history }: { history: WeatherHistoryEntry[] }) {
  const { t, lang } = useLang();
  const [visible, setVisible] = useState(false);

  const data = history.map((h) => ({
    day: lang === "es" ? h.dayLabelEs : h.dayLabel,
    emoji: h.emoji,
    tempHigh: h.tempHigh,
    tempLow: h.tempLow,
    precip: h.precipMm,
  }));

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        onClick={() => setVisible((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
        data-testid="btn-toggle-weather-chart"
      >
        <BarChart2 className="w-3.5 h-3.5" />
        {t("7-Day Weather History", "Historial Climático (7 Días)")}
        {visible ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {visible && (
        <div className="mt-3" data-testid="weather-history-chart">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={(props) => <EmojiDayTick {...props} chartData={data} />}
                axisLine={false}
                tickLine={false}
                height={48}
              />
              <YAxis
                yAxisId="temp"
                orientation="left"
                domain={[60, 100]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}°`}
              />
              <YAxis
                yAxisId="precip"
                orientation="right"
                domain={[0, 40]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}mm`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => {
                  if (name === "precip") return [`${value}mm`, t("Precipitation", "Precipitación")];
                  if (name === "tempHigh") return [`${value}°F`, t("High Temp", "Temp. Máx.")];
                  if (name === "tempLow") return [`${value}°F`, t("Low Temp", "Temp. Mín.")];
                  return [value, name];
                }}
              />
              <Bar
                yAxisId="precip"
                dataKey="precip"
                fill="#3B82F6"
                opacity={0.7}
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
                name="precip"
              >
                <LabelList
                  dataKey="emoji"
                  position="top"
                  content={(props) => {
                    const { x, y, width, value } = props;
                    if (!value) return null;
                    return (
                      <text
                        x={Number(x ?? 0) + Number(width ?? 0) / 2}
                        y={Number(y ?? 0) - 4}
                        textAnchor="middle"
                        fontSize={13}
                        data-testid="weather-emoji-label"
                      >
                        {String(value)}
                      </text>
                    );
                  }}
                />
              </Bar>
              <Line yAxisId="temp" type="monotone" dataKey="tempHigh" stroke="#F97316" strokeWidth={2} dot={{ r: 3, fill: "#F97316" }} name="tempHigh" />
              <Line yAxisId="temp" type="monotone" dataKey="tempLow" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="tempLow" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" /> {t("High", "Máx.")}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-0.5 bg-slate-400 inline-block rounded" style={{ borderTop: "2px dashed #94A3B8", background: "none" }} /> {t("Low", "Mín.")}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm bg-blue-400 opacity-70 inline-block" /> {t("Precip.", "Precip.")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_ICON_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  pdf:   { color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200",     label: "PDF" },
  excel: { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", label: "XLSX" },
  pptx:  { color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  label: "PPTX" },
  photo: { color: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200",     label: "IMG" },
};

function DocPreviewModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const { t, lang } = useLang();
  const catColors = DOC_CATEGORY_COLORS;
  const versions = doc.versions ?? [];
  const typeIcon = TYPE_ICON_CONFIG[doc.type] ?? { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", label: "FILE" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="doc-preview-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-konti-olive shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{doc.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${catColors[doc.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {categoryLabel(doc.category, lang)}
                </span>
                {versions.length > 1 && (
                  <span className="text-xs bg-konti-olive/10 text-konti-olive border border-konti-olive/30 px-1.5 py-0.5 rounded font-medium">
                    v{versions.length}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{doc.fileSize}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} data-testid="btn-close-doc-preview" className="text-muted-foreground hover:text-foreground ml-3 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {doc.previewable ? (
            <div className={`rounded-xl border-2 border-dashed ${typeIcon.border} ${typeIcon.bg} flex flex-col items-center justify-center h-44 gap-3`}>
              <div className={`w-16 h-16 rounded-2xl ${typeIcon.bg} border ${typeIcon.border} flex items-center justify-center`}>
                <FileText className={`w-9 h-9 ${typeIcon.color}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${typeIcon.color}`}>{typeIcon.label} {t("Document", "Documento")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("Full preview available in production.", "Vista completa disponible en producción.")}</p>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border-2 border-dashed ${typeIcon.border} ${typeIcon.bg} flex flex-col items-center justify-center h-36 gap-3`}>
              <div className={`w-14 h-14 rounded-2xl ${typeIcon.bg} border ${typeIcon.border} flex items-center justify-center`}>
                <FileText className={`w-8 h-8 ${typeIcon.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{typeIcon.label} — {t("Preview not available for this file type.", "Vista previa no disponible para este tipo de archivo.")}</p>
            </div>
          )}

          {doc.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("Description", "Descripción")}</p>
              <p className="text-sm text-foreground">{doc.description}</p>
            </div>
          )}

          {versions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground">{t("Version History", "Historial de Versiones")}</p>
              </div>
              <div className="space-y-2">
                {[...versions].reverse().map((v) => {
                  const isLatest = v.version === versions.length;
                  return (
                    <div key={v.version} className={`rounded-lg border p-3 text-xs ${isLatest ? "border-konti-olive/30 bg-konti-olive/5" : "border-border bg-muted/20"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold ${isLatest ? "text-konti-olive" : "text-muted-foreground"}`}>
                          v{v.version} {isLatest && <span className="text-xs font-normal ml-1 opacity-70">{t("current", "actual")}</span>}
                        </span>
                        <span className="text-muted-foreground">{new Date(v.uploadedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                        <span>{v.uploadedBy}</span>
                        <span>{v.fileSize}</span>
                      </div>
                      {(lang === "es" ? v.notesEs : v.notes) && (
                        <p className="text-muted-foreground leading-relaxed">{lang === "es" ? v.notesEs : v.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeOrderDelta({ projectId }: { projectId: string }) {
  const { t } = useLang();
  const { data } = useGetProjectChangeOrders(projectId);
  if (!data) return null;
  const { approvedDelta, pendingDelta } = data.totals;
  if (approvedDelta === 0 && pendingDelta === 0) return null;
  return (
    <div data-testid="budget-co-delta" className="mt-3 pt-3 border-t border-border space-y-1">
      {approvedDelta !== 0 && (
        <p className="text-xs flex items-center justify-between">
          <span className="text-muted-foreground">{t("Approved Change Orders", "Órdenes de Cambio Aprobadas")}</span>
          <span className={`font-semibold ${approvedDelta >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {approvedDelta >= 0 ? "+" : "−"}${Math.abs(approvedDelta).toLocaleString()}
          </span>
        </p>
      )}
      {pendingDelta !== 0 && (
        <p className="text-xs flex items-center justify-between">
          <span className="text-muted-foreground">{t("Pending Change Orders", "Órdenes Pendientes")}</span>
          <span className="font-semibold text-amber-600">
            {pendingDelta >= 0 ? "+" : "−"}${Math.abs(pendingDelta).toLocaleString()}
          </span>
        </p>
      )}
    </div>
  );
}

function DocCard({ doc, isClientView, projectId }: { doc: Document; isClientView: boolean; projectId: string }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showVersions, setShowVersions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Task #158 / A-05 — Team-only "Upload new version" affordance. We capture
  // the picked file size client-side; on success the API rolls primary
  // metadata forward, so we just refetch documents.
  const appendVersion = useAppendProjectDocumentVersion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) });
        toast({ title: t("New version uploaded", "Nueva versión subida") });
      },
      onError: () => {
        toast({ title: t("Could not upload version", "No se pudo subir la versión"), variant: "destructive" });
      },
    },
  });
  const versionFileRef = useRef<HTMLInputElement | null>(null);
  const onPickVersion = (e: React.MouseEvent) => {
    e.stopPropagation();
    versionFileRef.current?.click();
  };
  const onVersionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const fileSize = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    appendVersion.mutate({
      projectId,
      documentId: doc.id,
      data: {
        fileSize,
        notes: file.name,
        notesEs: file.name,
      },
    });
  };
  const updateDoc = useUpdateProjectDocument({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) });
        toast({
          title: doc.isClientVisible
            ? t("Hidden from client", "Oculto al cliente")
            : t("Visible to client", "Visible al cliente"),
        });
      },
      onError: () => {
        toast({ title: t("Could not update visibility", "No se pudo actualizar la visibilidad"), variant: "destructive" });
      },
    },
  });
  const onToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateDoc.mutate({
      projectId,
      documentId: doc.id,
      data: { isClientVisible: !doc.isClientVisible },
    });
  };

  const catColors = DOC_CATEGORY_COLORS;

  const subPhaseLabels: Record<string, { en: string; es: string }> = {
    schematic_design: { en: "SD", es: "DE" },
    design_development: { en: "DD", es: "DD" },
    construction_documents: { en: "CD", es: "DC" },
  };
  const subPhase = (doc as Document & { designSubPhase?: string }).designSubPhase;
  const subBadge = subPhase ? subPhaseLabels[subPhase] : null;

  const typeColors: Record<string, string> = {
    pdf: "text-red-600 bg-red-50",
    excel: "text-emerald-600 bg-emerald-50",
    pptx: "text-orange-600 bg-orange-50",
    photo: "text-sky-600 bg-sky-50",
  };

  const versions = doc.versions ?? [];
  const hasVersions = versions.length > 1;

  return (
    <>
      <div data-testid={`doc-${doc.id}`} className="rounded-lg border border-border hover:border-konti-olive/30 hover:bg-muted/20 transition-colors">
        <div className="flex items-start gap-2.5 p-2.5">
          <div
            role="button"
            tabIndex={0}
            className="flex-1 flex items-start gap-2.5 cursor-pointer min-w-0"
            onClick={() => setShowPreview(true)}
            onKeyDown={(e) => e.key === "Enter" && setShowPreview(true)}
            data-testid={`btn-preview-doc-${doc.id}`}
          >
            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${typeColors[doc.type] ?? "bg-muted text-muted-foreground"}`}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{doc.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${catColors[doc.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {categoryLabel(doc.category, lang)}
                </span>
                {subBadge && (
                  <span data-testid={`doc-sub-phase-${doc.id}`} className="text-xs px-1.5 py-0.5 rounded font-semibold bg-konti-olive/15 text-konti-olive border border-konti-olive/30">
                    {lang === "es" ? subBadge.es : subBadge.en}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{doc.fileSize}</span>
                {hasVersions && (
                  <span className="text-xs bg-konti-olive/10 text-konti-olive border border-konti-olive/30 px-1.5 py-0.5 rounded font-semibold">
                    v{versions.length}
                  </span>
                )}
                {doc.driveWebViewLink && (
                  <a
                    href={doc.driveWebViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 inline-flex items-center gap-1"
                    data-testid={`link-open-in-drive-${doc.id}`}
                    title={t("Open in Google Drive", "Abrir en Google Drive")}
                  >
                    {t("Drive", "Drive")}
                  </a>
                )}
                {/* Proxied download — re-checks visibility/role server-side
                    (Task #128 step 6). Used when the dashboard wants to
                    mediate the download (e.g. for client viewers) so the
                    raw Drive URL never leaves the API. */}
                {doc.driveDownloadProxyUrl && (
                  <a
                    href={doc.driveDownloadProxyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-1.5 py-0.5 rounded font-semibold bg-konti-olive/10 text-konti-olive border border-konti-olive/30 hover:bg-konti-olive/20 inline-flex items-center gap-1"
                    data-testid={`link-download-drive-${doc.id}`}
                    title={t("Download (proxied)", "Descargar (con proxy)")}
                  >
                    {t("Download", "Descargar")}
                  </a>
                )}
              </div>
            </div>
          </div>
          {!isClientView && (
            <button
              onClick={onToggleVisibility}
              disabled={updateDoc.isPending}
              className={`p-1 transition-colors shrink-0 mt-0.5 disabled:opacity-50 ${
                doc.isClientVisible
                  ? "text-konti-olive hover:text-konti-olive/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`btn-toggle-visibility-${doc.id}`}
              aria-label={
                doc.isClientVisible
                  ? t("Hide from client", "Ocultar al cliente")
                  : t("Make visible to client", "Hacer visible al cliente")
              }
              title={
                doc.isClientVisible
                  ? t("Visible to client — click to hide", "Visible al cliente — clic para ocultar")
                  : t("Hidden from client — click to share", "Oculto al cliente — clic para compartir")
              }
            >
              {doc.isClientVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          )}
          {isClientView && doc.isClientVisible && (
            <span
              data-testid={`badge-client-visible-${doc.id}`}
              className="shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded bg-konti-olive/10 text-konti-olive border border-konti-olive/30 flex items-center gap-1"
              title={t("Shared with you", "Compartido contigo")}
            >
              <Eye className="w-3 h-3" />
            </span>
          )}
          {!isClientView && (
            <>
              <input
                ref={versionFileRef}
                type="file"
                onChange={onVersionFileChange}
                className="hidden"
                data-testid={`input-version-file-${doc.id}`}
              />
              <button
                onClick={onPickVersion}
                disabled={appendVersion.isPending}
                className="p-1 text-muted-foreground hover:text-konti-olive transition-colors shrink-0 mt-0.5 disabled:opacity-50"
                data-testid={`btn-upload-version-${doc.id}`}
                aria-label={t("Upload new version", "Subir nueva versión")}
                title={t("Upload new version", "Subir nueva versión")}
              >
                {appendVersion.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadIcon className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          {hasVersions && (
            <button
              onClick={() => setShowVersions((v) => !v)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
              data-testid={`btn-toggle-versions-${doc.id}`}
              aria-label={showVersions ? t("Hide version history", "Ocultar historial") : t("Show version history", "Ver historial")}
            >
              {showVersions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {showVersions && (
          <div className="border-t border-border px-3 pb-2.5 pt-2 space-y-2" data-testid={`version-history-${doc.id}`}>
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
              <History className="w-3 h-3" /> {t("Version History", "Historial de Versiones")}
            </p>
            {[...versions].reverse().map((v) => {
              const isLatest = v.version === versions.length;
              return (
                <div key={v.version} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold shrink-0 ${isLatest ? "text-konti-olive" : "text-muted-foreground"}`}>v{v.version}</span>
                      <span className="text-muted-foreground font-medium truncate">{v.uploadedBy}</span>
                    </div>
                    {(lang === "es" ? v.notesEs : v.notes) && (
                      <p className="text-muted-foreground/80 truncate">{lang === "es" ? v.notesEs : v.notes}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap shrink-0 text-right">
                    {new Date(v.uploadedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPreview && <DocPreviewModal doc={doc} onClose={() => setShowPreview(false)} />}
    </>
  );
}

interface NoteReply { id: string; by: string; text: string; lang: string; createdAt: string; }
interface PanelNote {
  id: string;
  type: string;
  text: string;
  lang: string;
  createdAt: string;
  createdBy: string;
  status?: "open" | "answered";
  replies?: NoteReply[];
}

function authH(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem("konti_auth");
    if (!raw) return {};
    const tok = (JSON.parse(raw) as { token?: string }).token;
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch { return {}; }
}

function ClientQuestionsPanel({ projectId, isClientView }: { projectId: string; isClientView: boolean }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [notes, setNotes] = useState<PanelNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [tab, setTab] = useState<"notes" | "questions">(isClientView ? "notes" : "questions");
  const [replyTextById, setReplyTextById] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/notes`, { headers: authH() })
      .then((r) => r.ok ? r.json() : { notes: [] })
      .then((d: { notes?: PanelNote[] }) => setNotes(d.notes ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newNote.trim()) return;
    const noteType = isClientView
      ? (tab === "questions" ? "client_question" : "voice_note")
      : "general";
    const r = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ text: newNote, type: noteType, lang, source: "manual" }),
    });
    if (r.ok) {
      setNewNote("");
      toast({ title: noteType === "client_question" ? t("Question sent", "Pregunta enviada") : t("Note added", "Nota agregada") });
      load();
    } else {
      toast({ title: t("Could not save", "No se pudo guardar"), variant: "destructive" });
    }
  };

  const sendReply = async (noteId: string) => {
    const text = (replyTextById[noteId] ?? "").trim();
    if (!text) return;
    const r = await fetch(`/api/projects/${projectId}/notes/${noteId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ text, lang }),
    });
    if (r.ok) {
      setReplyTextById((m) => ({ ...m, [noteId]: "" }));
      toast({ title: t("Reply sent", "Respuesta enviada") });
      load();
    } else {
      toast({ title: t("Could not send reply", "No se pudo enviar la respuesta"), variant: "destructive" });
    }
  };

  const questions = notes.filter((n) => n.type === "client_question");
  const myNotes = notes.filter((n) => n.type === "voice_note" || n.type === "general");
  const openCount = questions.filter((q) => q.status !== "answered").length;

  const list = tab === "questions" ? questions : myNotes;
  const sortedList = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const placeholder = isClientView
    ? (tab === "questions" ? t("Ask a question for the team…", "Haz una pregunta para el equipo…") : t("Add a private note…", "Agregar una nota privada…"))
    : t("Add an internal note…", "Agregar una nota interna…");

  const submitLabel = isClientView && tab === "questions" ? t("Ask", "Preguntar") : t("Add", "Agregar");

  const TabBtn = ({ id, label, count }: { id: "notes" | "questions"; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      data-testid={`tab-${id}`}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${tab === id ? "bg-konti-olive text-white" : "bg-muted/40 text-foreground hover:bg-muted"}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === id ? "bg-white/20" : "bg-muted-foreground/15"}`}>{count}</span>
    </button>
  );

  return (
    <div className="bg-card border border-card-border rounded-xl p-5" data-testid="client-questions-panel">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-bold text-foreground">
          {isClientView ? t("My Notes & Questions", "Mis Notas y Preguntas") : t("Client Notes & Questions", "Notas y Preguntas del Cliente")}
        </h2>
        {openCount > 0 && !isClientView && (
          <span data-testid="open-questions-badge" className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-konti-olive/15 text-konti-olive">
            {t("{n} open", "{n} abiertas").replace("{n}", String(openCount))}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <TabBtn id="notes" label={isClientView ? t("My Notes", "Mis Notas") : t("Notes", "Notas")} count={myNotes.length} />
        <TabBtn id="questions" label={isClientView ? t("My Questions", "Mis Preguntas") : t("Open Questions", "Preguntas Abiertas")} count={tab === "questions" && !isClientView ? openCount : questions.length} />
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground italic mb-3">{t("Loading…", "Cargando…")}</p>
      ) : sortedList.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mb-3" data-testid="empty-state">
          {tab === "questions"
            ? (isClientView
                ? t("No questions yet. Ask anything below or use the AI Assistant — questions are saved here.", "Aún no hay preguntas. Pregunta abajo o usa el Asistente IA — las preguntas se guardan aquí.")
                : t("No client questions yet.", "Aún no hay preguntas del cliente."))
            : t("No notes yet.", "Aún no hay notas.")}
        </p>
      ) : (
        <ul className="space-y-2 mb-4 max-h-[28rem] overflow-y-auto pr-1">
          {sortedList.map((n) => {
            const isQuestion = n.type === "client_question";
            const isOpen = isQuestion && n.status !== "answered";
            return (
              <li
                key={n.id}
                data-testid={`note-${n.id}`}
                className={`rounded-md p-3 text-sm border ${isOpen ? "bg-konti-olive/5 border-konti-olive/20" : "bg-muted/40 border-transparent"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-foreground flex-1 whitespace-pre-wrap">{n.text}</p>
                  {isQuestion && (
                    <span
                      data-testid={`status-${n.id}`}
                      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${isOpen ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}
                    >
                      {isOpen ? t("Open", "Abierta") : t("Answered", "Respondida")}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {n.createdBy} · {new Date(n.createdAt).toLocaleString()}
                </p>

                {n.replies && n.replies.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-konti-olive/40 space-y-2">
                    {n.replies.map((r) => (
                      <div key={r.id} data-testid={`reply-${r.id}`} className="text-xs">
                        <p className="text-foreground whitespace-pre-wrap">{r.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-medium">{r.by}</span> · {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {!isClientView && isQuestion && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={replyTextById[n.id] ?? ""}
                      onChange={(e) => setReplyTextById((m) => ({ ...m, [n.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") void sendReply(n.id); }}
                      placeholder={t("Write a reply…", "Escribe una respuesta…")}
                      data-testid={`input-reply-${n.id}`}
                      className="flex-1 px-2 py-1 rounded-md border border-input bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => void sendReply(n.id)}
                      disabled={!(replyTextById[n.id] ?? "").trim()}
                      data-testid={`btn-reply-${n.id}`}
                      className="px-2.5 py-1 bg-konti-olive text-white text-xs rounded-md hover:bg-konti-olive/90 disabled:opacity-40"
                    >
                      {t("Reply", "Responder")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(isClientView || tab === "notes") && (
        <div className="flex gap-2">
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder={placeholder}
            data-testid="input-add-note"
            className="flex-1 px-3 py-1.5 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={!newNote.trim()}
            data-testid="btn-add-note"
            className="px-3 py-1.5 bg-konti-olive text-white text-sm rounded-md hover:bg-konti-olive/90 disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { viewRole, setViewRole, user } = useAuth();
  const [showUpload, setShowUpload] = useState(false);

  const queryClient = useQueryClient();
  const onProjectUpdated = () => {
    return queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
  };
  const { data: project, isLoading: projectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });
  const { data: tasks = [] } = useGetProjectTasks(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectTasksQueryKey(projectId) }
  });
  const { data: weather } = useGetProjectWeather(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectWeatherQueryKey(projectId) }
  });
  const { data: allDocs = [] } = useGetProjectDocuments(projectId, undefined, {
    query: { enabled: !!projectId, queryKey: getGetProjectDocumentsQueryKey(projectId, undefined) }
  });
  const { data: calc } = useGetProjectCalculations(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectCalculationsQueryKey(projectId) }
  });

  const isClientView = viewRole === "client";
  const docs = isClientView ? allDocs.filter((d) => d.isClientVisible) : allDocs;

  if (projectLoading || !project) {
    return <div className="h-96 bg-card rounded-xl border animate-pulse" />;
  }

  const spendPct = Math.round((project.budgetUsed / project.budgetAllocated) * 100);
  const phaseLabel = lang === "es" ? project.phaseLabelEs : project.phaseLabel;

  const phases = [
    { key: "discovery", label: t("Discovery", "Descubrimiento"), num: 1 },
    { key: "consultation", label: t("Consultation", "Consulta"), num: 2 },
    { key: "pre_design", label: t("Pre-Design", "Pre-Diseño"), num: 3 },
    { key: "schematic_design", label: t("SD", "DE"), num: 4 },
    { key: "design_development", label: t("DD", "DD"), num: 5 },
    { key: "construction_documents", label: t("CD", "DC"), num: 6 },
    { key: "permits", label: t("Permits", "Permisos"), num: 7 },
    { key: "construction", label: t("Construction", "Construcción"), num: 8 },
    { key: "completed", label: t("Completed", "Completado"), num: 9 },
  ];

  const priorityColors: Record<string, string> = {
    high: "text-red-600 bg-red-50 border border-red-200",
    medium: "text-amber-700 bg-amber-50 border border-amber-200",
    low: "text-slate-600 bg-slate-50 border border-slate-200",
  };

  return (
    <div className="space-y-6 overflow-x-clip" data-testid="project-detail-page">
      {/* Header */}
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> {t("Back to Dashboard", "Volver al Panel")}
        </Link>

        <div className="relative rounded-xl overflow-hidden h-48 sm:h-56">
          {project.coverImage && (
            <img src={resolveSeedImageUrl(project.coverImage)} alt={project.name} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-konti-slate/65 via-konti-slate/35 to-konti-slate/0" />
          {/* Localized darker bottom band guarantees contrast for the title block on bright cover photos without darkening the top of the image. */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/20 to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/80 text-sm mb-1 [text-shadow:_0_1px_3px_rgb(0_0_0_/_0.55)]">{project.clientName}</p>
                <h1 className="text-white text-xl sm:text-2xl font-bold break-words [text-shadow:_0_1px_4px_rgb(0_0_0_/_0.65)]">{project.name}</h1>
                <p className="text-white/80 text-sm flex items-center gap-1 mt-1 [text-shadow:_0_1px_3px_rgb(0_0_0_/_0.55)]">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {project.location}
                </p>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-2 flex-wrap">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-konti-olive text-white">
                  {phaseLabel}
                </span>
                {user?.role === "client" && typeof project.clientCoverLandmark === "number" && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/85 text-konti-dark backdrop-blur-sm"
                    data-testid={`pill-milestone-${projectId}`}
                  >
                    {project.clientCoverLandmark}% {t("milestone", "hito")}
                  </span>
                )}
                {/* P2.1 — promoted from a tiny text-shadow link to a
                    primary action button. Carla's meeting feedback:
                    "el botón era pequeño y poco visible". The button now
                    has solid contrast (konti-light background) and a
                    document icon for instant recognition. */}
                <Link
                  href={`/projects/${projectId}/report`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-konti-light text-konti-dark hover:bg-white shadow-md transition-colors"
                  data-testid="link-view-report"
                >
                  <FileText className="w-4 h-4" />
                  {t("View Client Report", "Ver Reporte del Cliente")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task #127 — team-only quick actions: site visit / client interaction / Asana link */}
      {user?.role !== "client" && (
        <ProjectTeamActions
          projectId={projectId}
          actor={user?.name ?? user?.email ?? "team"}
          asanaGid={project.asanaGid}
        />
      )}

      {/* View toggle (team members only) */}
      {user?.role !== "client" && (
        <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit" data-testid="view-role-toggle">
          <button
            onClick={() => setViewRole("team")}
            data-testid="btn-team-view"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!isClientView ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <Eye className="inline w-3.5 h-3.5 mr-1.5" />{t("Team View", "Vista Interna")}
          </button>
          <button
            onClick={() => setViewRole("client")}
            data-testid="btn-client-view"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${isClientView ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <EyeOff className="inline w-3.5 h-3.5 mr-1.5" />{t("Client View", "Vista del Cliente")}
          </button>
        </div>
      )}

      {/* Plain-language "what's happening now" — visible to client + team */}
      <StatusSentence
        projectId={projectId}
        currentStatusNote={project.currentStatusNote}
        currentStatusNoteEs={project.currentStatusNoteEs}
        phaseLabel={project.phaseLabel}
        phaseLabelEs={project.phaseLabelEs}
        progressPercent={project.progressPercent}
        canEdit
      />

      <div className="grid md:grid-cols-3 gap-4 md:gap-6">
        {/* Left column */}
        <div className="md:col-span-2 space-y-4 md:space-y-6">
          {/* Phase timeline */}
          <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
            <h2 className="font-bold text-foreground mb-4">{t("Project Timeline", "Cronograma del proyecto")}</h2>
            <div className="flex items-center gap-1">
              {phases.map((phase, i) => {
                const isCompleted = project.phaseNumber > phase.num;
                const isCurrent = project.phaseNumber === phase.num;
                return (
                  <div key={phase.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isCompleted ? "bg-konti-olive text-white" :
                      isCurrent ? "bg-konti-olive/20 border-2 border-konti-olive text-konti-olive" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : phase.num}
                    </div>
                    {i < phases.length - 1 && (
                      <div className={`h-0.5 w-full ${isCompleted ? "bg-konti-olive" : "bg-border"}`} />
                    )}
                    <span className="text-xs text-muted-foreground text-center leading-tight hidden md:block">{phase.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Client Questions & Notes (auto-collected from AI chat) */}
          <ClientQuestionsPanel projectId={projectId} isClientView={isClientView} />

          {/* Pre-Design & Viability Panel */}
          <PreDesignPanel projectId={projectId} isClientView={isClientView} currentPhase={project.phase} />

          {/* Proposals (Pre-Design → onward) */}
          <ProposalsPanel projectId={projectId} isClientView={isClientView} currentPhase={project.phase} />

          {/* Design sub-phases (Design phase onward) */}
          <div id="design">
            <DesignPanel projectId={projectId} isClientView={isClientView} currentPhase={project.phase} />
          </div>

          {/* Change Orders (Design phase onward, or anytime there are existing COs) */}
          <div id="change-orders">
            <ChangeOrdersPanel projectId={projectId} isClientView={isClientView} currentPhase={project.phase} />
          </div>

          {/* Phase 4 — Permits authorization workflow */}
          <PermitsPanel projectId={projectId} projectPhase={project.phase} onProjectUpdated={onProjectUpdated} />

          {/* Phase 5 — Construction milestones + inspections (visible from construction onward) */}
          {(project.phase === "construction" || project.phase === "completed") && (
            <>
              <MilestonesTimeline projectId={projectId} />
              <InspectionsSection projectId={projectId} />
            </>
          )}

          {/* Phase Punchlist — gates phase advancement */}
          <div id="punchlist">
            <PunchlistPanel
              projectId={projectId}
              currentPhase={project.phase}
              isClientView={isClientView}
              onAdvanced={onProjectUpdated}
            />
          </div>

          {/* Site Photos gallery (#105) */}
          <SitePhotosGallery projectId={projectId} isClientView={isClientView} />

          {/* P3 — Site Visit panel (team-only). First-class capture pad with
              audio + Whisper transcription + per-item visibility. */}
          {!isClientView && (
            <SiteVisitPanel
              projectId={projectId}
              defaultVisitor={user?.name ?? user?.email ?? "Team"}
            />
          )}

          {/* P6.2 — Contractor monitoring panel (team-only). 5-section
              expansion of the original status-pill component. */}
          {!isClientView && <ContractorMonitoringPanel projectId={projectId} />}

          {/* Weather widget */}
          {weather && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
              <h2 className="font-bold text-foreground mb-4">{t("Site Conditions", "Condiciones del Sitio")} — {weather.city}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="w-3 h-3" />{t("Temperature", "Temperatura")}</span>
                  <span className="text-xl font-bold">{weather.temperature}{weather.temperatureUnit}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("Condition", "Condición")}</span>
                  <span className="text-sm font-medium">{lang === "es" ? weather.conditionEs : weather.condition}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" />{t("Humidity", "Humedad")}</span>
                  <span className="text-xl font-bold">{weather.humidity}%</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Wind className="w-3 h-3" />{t("Wind", "Viento")}</span>
                  <span className="text-xl font-bold">{weather.windSpeed} {weather.windUnit}</span>
                </div>
              </div>

              <div className={`rounded-lg p-3 ${
                weather.buildSuitability === "green" ? "bg-emerald-50 border border-emerald-200" :
                weather.buildSuitability === "yellow" ? "bg-amber-50 border border-amber-200" :
                "bg-red-50 border border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3 h-3 rounded-full ${
                    weather.buildSuitability === "green" ? "bg-emerald-500" :
                    weather.buildSuitability === "yellow" ? "bg-amber-500" : "bg-red-500"
                  }`} />
                  <span className="font-bold text-sm" data-testid="build-status-label">
                    {t("Build Status", "Estado de Obra")}: {lang === "es" ? weather.buildSuitabilityLabelEs : weather.buildSuitabilityLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? weather.buildSuitabilityReasonEs : weather.buildSuitabilityReason}
                </p>
              </div>

              {weather.weatherHistory && weather.weatherHistory.length > 0 && (
                <WeatherHistoryChart history={weather.weatherHistory} />
              )}
            </div>
          )}

          {/* Tasks */}
          <div id="tasks" className="bg-card rounded-xl border border-card-border p-5 shadow-sm scroll-mt-20">
            <h2 className="font-bold text-foreground mb-4">{t("Tasks", "Tareas")}</h2>
            <div className="space-y-2">
              {tasks.map((task) => {
                const title = lang === "es" ? task.titleEs : task.title;
                return (
                  <div key={task.id} data-testid={`task-${task.id}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      task.completed ? "bg-konti-olive border-konti-olive" : "border-border"
                    }`}>
                      {task.completed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.assignee && (
                          <span className="text-xs text-muted-foreground">{task.assignee}</span>
                        )}
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {task.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 md:space-y-6">
          {/* Phase 5 — Cost-Plus breakdown (shown for construction & completed projects) */}
          {(project.phase === "construction" || project.phase === "completed") && (
            <CostPlusBudget projectId={projectId} isClientView={isClientView} />
          )}

          <ProjectInvoices projectId={projectId} />

          {/* Budget */}
          <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
            <h2 className="font-bold text-foreground mb-3">{t("Budget", "Presupuesto")}</h2>
            {isClientView ? (
              <>
                <div className="text-3xl font-bold text-foreground mb-1">{spendPct}%</div>
                <p className="text-xs text-muted-foreground mb-3">{t("of budget used", "del presupuesto utilizado")}</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground mb-1">${project.budgetUsed.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mb-3">{t("of", "de")} ${project.budgetAllocated.toLocaleString()} {t("allocated", "asignado")}</p>
              </>
            )}
            <div className="h-2 rounded-full bg-muted overflow-hidden mb-1">
              <div className={`h-full rounded-full ${spendPct > 90 ? "bg-red-500" : spendPct > 70 ? "bg-amber-500" : "bg-konti-olive"}`} style={{ width: `${Math.min(spendPct, 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{spendPct}% {t("used", "utilizado")}</p>
            <ChangeOrderDelta projectId={projectId} />
          </div>

          {/* Team-only: client activity audit log */}
          {!isClientView && (
            <ClientActivityCard projectId={projectId} />
          )}

          {/* Team-only: editable client contact info (CSV item #20). */}
          {!isClientView && (
            <ClientContactCard
              projectId={projectId}
              clientName={project.clientName}
              initialPhone={(project as { clientPhone?: string }).clientPhone ?? ""}
              initialPostal={(project as { clientPostalAddress?: string }).clientPostalAddress ?? ""}
              initialPhysical={(project as { clientPhysicalAddress?: string }).clientPhysicalAddress ?? ""}
            />
          )}

          {/* Team-only: project-level metadata (B-05) — single source of truth
              for square meters, bathrooms, kitchens, project type, and
              contingency, consumed read-only by the Contractor Calculator. */}
          {!isClientView && (
            <ProjectMetadataCard
              projectId={projectId}
              variant="editable"
              squareMeters={project.squareMeters}
              bathrooms={project.bathrooms}
              kitchens={project.kitchens}
              projectType={project.projectType}
              contingencyPercent={project.contingencyPercent}
            />
          )}

          {/* Team-only: contractor monitoring narrative card */}
          {!isClientView && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="contractor-monitoring-card">
              <ContractorMonitoringSection projectId={projectId} variant="card" />
            </div>
          )}

          {/* Team */}
          {!isClientView && project.teamMembers && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4" /> {t("Team", "Equipo")}
              </h2>
              <div className="space-y-2">
                {project.teamMembers.map((member) => (
                  <div key={member} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-konti-olive/20 text-konti-olive flex items-center justify-center text-xs font-bold shrink-0">
                      {member.split(" ").map(w => w[0]).slice(0,2).join("")}
                    </div>
                    <span className="text-sm text-foreground">{member}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estimated vs Actual snapshot */}
          <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="variance-snapshot-link">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-foreground">{t("Estimated vs Actual", "Estimado vs Real")}</h2>
              <Link
                href={`/calculator?projectId=${projectId}&tab=variance`}
                className="text-xs text-konti-olive hover:text-konti-olive/80 font-medium transition-colors"
              >
                {t("Open Variance Report", "Abrir Reporte de Varianza")} →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Compare this project's contractor estimate (or calculator entries) against the cost-plus actuals.",
                "Compara el estimado de contratista (o las entradas de calculadora) de este proyecto contra los costos reales del cost-plus."
              )}
            </p>
          </div>

          {/* Material Cost Summary */}
          {calc && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="material-cost-summary">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-foreground">{t("Material Costs", "Costos de Materiales")}</h2>
                <Link
                  href="/calculator"
                  className="text-xs text-konti-olive hover:text-konti-olive/80 font-medium transition-colors"
                >
                  {t("Full Calculator", "Calculadora Completa")} →
                </Link>
              </div>
              <div className="space-y-1.5">
                {Object.entries(calc.subtotalByCategory ?? {}).map(([cat, total]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{cat}</span>
                    <span className="font-semibold text-foreground">${(total as number).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-1.5 mt-1.5 flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{t("Grand Total", "Total General")}</span>
                  <span className="text-sm font-bold text-konti-olive">${calc.grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-foreground">{t("Documents", "Documentos")}</h2>
              <button
                onClick={() => setShowUpload(true)}
                data-testid="btn-upload-document"
                className="flex items-center gap-1 text-xs text-konti-olive hover:text-konti-olive/80 font-medium transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> {t("Upload", "Subir")}
              </button>
            </div>
            <div className="space-y-3">
              {DOC_GROUPS.map((group) => {
                const groupDocs = docs.filter((d) => groupForCategory(d.category) === group.key);
                if (groupDocs.length === 0) return null;
                return (
                  <div key={group.key} data-testid={`doc-group-${group.key}`} className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-0.5">
                      {t(group.label, group.labelEs)}
                      <span className="ml-1 text-muted-foreground/70">({groupDocs.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {groupDocs.map((doc) => (
                        <DocCard key={doc.id} doc={doc} isClientView={isClientView} projectId={projectId} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {docs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">{t("No documents available.", "No hay documentos disponibles.")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          projectId={projectId}
          lockedToClientReview={isClientView}
        />
      )}
    </div>
  );
}

function ClientContactCard({
  projectId,
  clientName,
  initialPhone,
  initialPostal,
  initialPhysical,
}: {
  projectId: string;
  clientName: string;
  initialPhone: string;
  initialPostal: string;
  initialPhysical: string;
}) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(initialPhone);
  const [postal, setPostal] = useState(initialPostal);
  const [physical, setPhysical] = useState(initialPhysical);

  useEffect(() => { setPhone(initialPhone); }, [initialPhone]);
  useEffect(() => { setPostal(initialPostal); }, [initialPostal]);
  useEffect(() => { setPhysical(initialPhysical); }, [initialPhysical]);

  const mutation = useUpdateProjectClientContact({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        toast({ title: t("Saved", "Guardado"), description: t("Client contact updated.", "Contacto del cliente actualizado.") });
        setEditing(false);
      },
      onError: () => {
        toast({ variant: "destructive", title: t("Save failed", "Error al guardar"), description: t("Could not update client contact.", "No se pudo actualizar el contacto del cliente.") });
      },
    },
  });

  const onSave = () => {
    mutation.mutate({
      projectId,
      data: {
        clientPhone: phone.trim(),
        clientPostalAddress: postal.trim(),
        clientPhysicalAddress: physical.trim(),
      },
    });
  };

  const onCancel = () => {
    setPhone(initialPhone);
    setPostal(initialPostal);
    setPhysical(initialPhysical);
    setEditing(false);
  };

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="client-contact-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-foreground flex items-center gap-1.5">
          <Users className="w-4 h-4" /> {t("Client Contact", "Contacto del Cliente")}
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1 rounded-md border border-input hover:bg-muted text-muted-foreground"
            data-testid="client-contact-edit"
          >
            {t("Edit", "Editar")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">{clientName}</p>
      {!editing ? (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Phone", "Teléfono")}</dt>
            <dd className="text-foreground" data-testid="client-contact-phone">{phone || t("—", "—")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Postal Address", "Dirección Postal")}</dt>
            <dd className="text-foreground whitespace-pre-line" data-testid="client-contact-postal">{postal || t("—", "—")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Physical Address", "Dirección Física")}</dt>
            <dd className="text-foreground whitespace-pre-line" data-testid="client-contact-physical">{physical || t("—", "—")}</dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">{t("Phone", "Teléfono")}</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="client-contact-phone-input"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">{t("Postal Address", "Dirección Postal")}</label>
            <textarea
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="client-contact-postal-input"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">{t("Physical Address", "Dirección Física")}</label>
            <textarea
              value={physical}
              onChange={(e) => setPhysical(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="client-contact-physical-input"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onSave}
              disabled={mutation.isPending}
              className="px-3 py-1.5 rounded-md bg-konti-olive text-white text-sm hover:bg-konti-olive/90 disabled:opacity-50"
              data-testid="client-contact-save"
            >
              {mutation.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={mutation.isPending}
              className="px-3 py-1.5 rounded-md border border-input text-sm hover:bg-muted"
              data-testid="client-contact-cancel"
            >
              {t("Cancel", "Cancelar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <RequireAuth>
      <AppLayout>
        <ProjectDetailContent projectId={params.id} />
      </AppLayout>
    </RequireAuth>
  );
}
