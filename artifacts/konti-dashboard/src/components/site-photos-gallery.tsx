import { useMemo, useState } from "react";
import { Camera, X as XIcon, ImageIcon, Star, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectDocuments,
  useUpdateProjectDocument,
  useDeleteProjectDocument,
  getGetProjectDocumentsQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  type Document,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";

export type PhotoCategoryKey =
  | "site_conditions"
  | "construction_progress"
  | "punchlist_evidence"
  | "final";

export const PHOTO_CATEGORY_OPTIONS: Array<{
  key: PhotoCategoryKey;
  label: string;
  labelEs: string;
}> = [
  { key: "site_conditions", label: "Site Conditions", labelEs: "Condiciones del Sitio" },
  { key: "construction_progress", label: "Construction Progress", labelEs: "Progreso de Construcción" },
  { key: "punchlist_evidence", label: "Punchlist Evidence", labelEs: "Evidencia de Punchlist" },
  { key: "final", label: "Final / Completed", labelEs: "Final / Completado" },
];

export function photoCategoryLabel(key: string, lang: "en" | "es"): string {
  const opt = PHOTO_CATEGORY_OPTIONS.find((o) => o.key === key);
  if (!opt) return key;
  return lang === "es" ? opt.labelEs : opt.label;
}

function selectPhotos(
  docs: Document[],
  isClientView: boolean,
): Document[] {
  return docs
    .filter((d) => d.type === "photo")
    .filter((d) => !isClientView || d.isClientVisible)
    .filter((d) => typeof d.photoCategory === "string");
}

// Drive-aware URL pickers (Task #128). When a photo lives in Drive the API
// strips the inline `data:` URL to keep responses small, so we have to fall
// back to the Drive-side URLs. For client role the raw Drive links are
// stripped server-side as well, leaving `driveDownloadProxyUrl` as the only
// safe choice — that's why it's always the last sturdy fallback.
function pickThumbUrl(p: Document): string | undefined {
  return p.driveThumbnailLink ?? p.driveDownloadProxyUrl ?? resolveSeedImageUrl(p.imageUrl);
}
function pickFullUrl(p: Document): string | undefined {
  return p.driveDownloadProxyUrl ?? p.driveWebContentLink ?? resolveSeedImageUrl(p.imageUrl);
}

function groupByCategory(photos: Document[]): Record<PhotoCategoryKey, Document[]> {
  const out: Record<PhotoCategoryKey, Document[]> = {
    site_conditions: [],
    construction_progress: [],
    punchlist_evidence: [],
    final: [],
  };
  for (const p of photos) {
    const k = p.photoCategory as PhotoCategoryKey | undefined;
    if (k && k in out) out[k].push(p);
  }
  return out;
}

interface SitePhotosGalleryProps {
  projectId: string;
  isClientView: boolean;
}

export function SitePhotosGallery({ projectId, isClientView }: SitePhotosGalleryProps) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  // Track which photo's "Use as cover" toggle is mid-flight so the button
  // can show a disabled/spinner state without freezing the rest of the
  // gallery. Keyed by document id (one mutation per photo).
  const [pendingCoverIds, setPendingCoverIds] = useState<Set<string>>(new Set());

  const { data: allDocs = [] } = useGetProjectDocuments(projectId, undefined, {
    query: { enabled: !!projectId, queryKey: getGetProjectDocumentsQueryKey(projectId, undefined) },
  });

  const photos = useMemo(() => selectPhotos(allDocs, isClientView), [allDocs, isClientView]);
  const grouped = useMemo(() => groupByCategory(photos), [photos]);
  const lightbox = useMemo(
    () => (lightboxId ? photos.find((p) => p.id === lightboxId) ?? null : null),
    [lightboxId, photos],
  );

  // Task #136 — staff-only cover curation. The mutation flips the
  // featuredAsCover flag on a single construction-progress photo; the
  // server enforces the single-cover invariant by flipping any other
  // flagged photo on the same project off.
  const updateDocument = useUpdateProjectDocument();
  // Task #158 / A-09 — caption-edit + delete affordances for client-uploaded
  // photos. The same mutation hook handles both team and client edits; the
  // server-side dual gate enforces ownership for clients.
  const deleteDocument = useDeleteProjectDocument();
  const refreshDocs = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetProjectDocumentsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
    ]);
  };
  const canManagePhoto = (p: Document) => {
    if (!isClientView) return true; // staff/team always
    return !!user && p.uploadedBy === user.id;
  };
  const handleEditCaption = async (e: React.MouseEvent, p: Document) => {
    e.stopPropagation();
    e.preventDefault();
    const next = window.prompt(
      t("Edit caption (max 500 chars):", "Editar subtítulo (máx. 500 caracteres):"),
      p.caption ?? "",
    );
    if (next === null) return;
    const trimmed = next.slice(0, 500);
    try {
      await updateDocument.mutateAsync({
        projectId,
        documentId: p.id,
        data: { caption: trimmed },
      });
      await refreshDocs();
      toast({ title: t("Caption updated", "Subtítulo actualizado") });
    } catch {
      toast({ title: t("Could not update caption", "No se pudo actualizar el subtítulo"), variant: "destructive" });
    }
  };
  const handleDeletePhoto = async (e: React.MouseEvent, p: Document) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(t(`Delete "${p.name}"?`, `¿Eliminar "${p.name}"?`))) return;
    try {
      await deleteDocument.mutateAsync({ projectId, documentId: p.id });
      await refreshDocs();
      toast({ title: t("Photo deleted", "Foto eliminada") });
    } catch {
      toast({ title: t("Could not delete photo", "No se pudo eliminar la foto"), variant: "destructive" });
    }
  };
  const handleToggleCover = async (
    e: React.MouseEvent | React.KeyboardEvent,
    photo: Document,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (isClientView) return; // Defensive — UI doesn't render the button for clients.
    const next = !(photo.featuredAsCover === true);
    setPendingCoverIds((prev) => {
      const out = new Set(prev);
      out.add(photo.id);
      return out;
    });
    try {
      await updateDocument.mutateAsync({
        projectId,
        documentId: photo.id,
        data: { featuredAsCover: next },
      });
      // M-1: use the shared `refreshDocs` helper instead of duplicating the
      // invalidation set inline. The cover affects 3 cache keys: documents,
      // project (liveCoverImage), and the project list (dashboard card).
      // Centralizing means adding a 4th key only happens once.
      await refreshDocs();
      toast({
        title: next
          ? t("Set as project cover", "Establecida como portada del proyecto")
          : t("Removed from project cover", "Removida de portada del proyecto"),
        description: next
          ? t(
              "This photo will now appear on the project card.",
              "Esta foto aparecerá en la tarjeta del proyecto.",
            )
          : t(
              "The most recent photo will be used instead.",
              "Se usará la foto más reciente en su lugar.",
            ),
      });
    } catch {
      toast({
        title: t("Could not update cover", "No se pudo actualizar la portada"),
        variant: "destructive",
      });
    } finally {
      setPendingCoverIds((prev) => {
        const out = new Set(prev);
        out.delete(photo.id);
        return out;
      });
    }
  };

  return (
    <div
      id="photos"
      className="bg-card rounded-xl border border-card-border p-5 shadow-sm scroll-mt-20"
      data-testid="site-photos-gallery"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground flex items-center gap-1.5">
          <Camera className="w-4 h-4" /> {t("Site Photos", "Fotos del Sitio")}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid="site-photos-count">
          {photos.length} {t(photos.length === 1 ? "photo" : "photos", photos.length === 1 ? "foto" : "fotos")}
        </span>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="site-photos-empty">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("No site photos yet.", "Aún no hay fotos del sitio.")}</p>
          {!isClientView && (
            <p className="text-xs mt-1">{t("Use the Documents Upload to add photos by category.", "Usa el botón Subir en Documentos para agregar fotos por categoría.")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {PHOTO_CATEGORY_OPTIONS.map((cat) => {
            const items = grouped[cat.key];
            if (items.length === 0) return null;
            return (
              <div
                key={cat.key}
                data-testid={`photo-category-${cat.key}`}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {photoCategoryLabel(cat.key, lang)}
                  </p>
                  <span className="text-[11px] text-muted-foreground/70">
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {items.map((p) => {
                    // The "Use as cover" affordance is only meaningful for
                    // construction-progress photos in the staff view (clients
                    // never see the live cover field, so curating it would be
                    // a no-op for them).
                    const isCoverCandidate =
                      !isClientView && cat.key === "construction_progress";
                    const isFeatured = p.featuredAsCover === true;
                    const isPending = pendingCoverIds.has(p.id);
                    return (
                      <div key={p.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => setLightboxId(p.id)}
                          data-testid={`photo-thumb-${p.id}`}
                          className={`relative aspect-square w-full overflow-hidden rounded-lg border bg-muted hover:border-konti-olive transition-colors text-left ${
                            isFeatured ? "border-konti-olive ring-2 ring-konti-olive/40" : "border-card-border"
                          }`}
                          aria-label={p.caption ?? p.name}
                        >
                          {pickThumbUrl(p) ? (
                            <img
                              src={pickThumbUrl(p)}
                              alt={p.caption ?? p.name}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                          {p.caption && (
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-2 py-1 line-clamp-2">
                              {p.caption}
                            </span>
                          )}
                          {isFeatured && (
                            <span
                              className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-konti-olive text-white text-[10px] font-semibold px-1.5 py-0.5 shadow"
                              data-testid={`photo-cover-badge-${p.id}`}
                            >
                              <Star className="w-3 h-3 fill-current" />
                              {t("Cover", "Portada")}
                            </span>
                          )}
                        </button>
                        {canManagePhoto(p) && (
                          <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => void handleEditCaption(e, p)}
                              data-testid={`photo-edit-caption-${p.id}`}
                              aria-label={t("Edit caption", "Editar subtítulo")}
                              title={t("Edit caption", "Editar subtítulo")}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-foreground border border-card-border shadow-sm hover:bg-white"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => void handleDeletePhoto(e, p)}
                              data-testid={`photo-delete-${p.id}`}
                              aria-label={t("Delete photo", "Eliminar foto")}
                              title={t("Delete photo", "Eliminar foto")}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-destructive border border-card-border shadow-sm hover:bg-white"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {isCoverCandidate && (
                          <button
                            type="button"
                            onClick={(e) => void handleToggleCover(e, p)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                void handleToggleCover(e, p);
                              }
                            }}
                            disabled={isPending}
                            data-testid={`photo-cover-toggle-${p.id}`}
                            aria-pressed={isFeatured}
                            aria-label={
                              isFeatured
                                ? t("Remove as project cover", "Quitar como portada del proyecto")
                                : t("Use as project cover", "Usar como portada del proyecto")
                            }
                            title={
                              isFeatured
                                ? t("Remove as project cover", "Quitar como portada del proyecto")
                                : t("Use as project cover", "Usar como portada del proyecto")
                            }
                            className={`absolute top-1 right-1 inline-flex items-center justify-center w-7 h-7 rounded-full border shadow-sm transition-colors ${
                              isFeatured
                                ? "bg-konti-olive text-white border-konti-olive hover:bg-konti-olive/90"
                                : "bg-white/90 text-konti-olive border-card-border opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white"
                            } ${isPending ? "opacity-60 cursor-wait" : ""}`}
                          >
                            <Star className={`w-4 h-4 ${isFeatured ? "fill-current" : ""}`} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          data-testid="photo-lightbox"
          onClick={() => setLightboxId(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxId(null); }}
            data-testid="photo-lightbox-close"
            aria-label={t("Close", "Cerrar")}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <div
            className="max-w-4xl w-full bg-card rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black">
              {pickFullUrl(lightbox) ? (
                <img
                  src={pickFullUrl(lightbox)}
                  alt={lightbox.caption ?? lightbox.name}
                  className="w-full max-h-[70vh] object-contain"
                  data-testid="photo-lightbox-image"
                />
              ) : (
                <div className="w-full h-64 flex items-center justify-center text-white/60">
                  <ImageIcon className="w-12 h-12" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                <h3 className="font-bold text-foreground min-w-0 break-words" data-testid="photo-lightbox-title">
                  {lightbox.name}
                </h3>
                <span className="self-start sm:self-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-konti-olive/10 text-konti-olive border border-konti-olive/30">
                  {photoCategoryLabel(lightbox.photoCategory ?? "", lang)}
                </span>
              </div>
              {lightbox.caption && (
                <p className="text-sm text-foreground" data-testid="photo-lightbox-caption">
                  {lightbox.caption}
                </p>
              )}
              <p className="text-xs text-muted-foreground" data-testid="photo-lightbox-meta">
                {lightbox.uploadedBy} · {new Date(lightbox.uploadedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
