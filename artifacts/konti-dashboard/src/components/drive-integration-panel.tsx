import { useEffect, useMemo, useState } from "react";
import {
  HardDrive,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Unlink2,
  FolderPlus,
  CloudUpload,
} from "lucide-react";
import {
  useGetDriveStatus,
  useListDriveFolders,
  useConfigureDrive,
  useDisconnectDrive,
  useGetDriveSyncLog,
  useBackfillDriveDocuments,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Task #128 — Google Drive document storage.
 *
 * Mirrors the Asana panel layout: status banner, folder picker (or
 * "create new"), visibility/delete policy, disconnect, sync log, and a
 * one-click backfill button for existing in-memory documents. The
 * integration runs in disconnected mode for the demo (the connector wasn't
 * authorized) — the UI surfaces the precise state so an admin can recover.
 */
export function DriveIntegrationPanel() {
  const { t } = useLang();
  const { toast } = useToast();

  const status = useGetDriveStatus({
    query: { queryKey: ["/api/integrations/drive/status"], refetchOnWindowFocus: false },
  });
  const syncLog = useGetDriveSyncLog({
    query: { queryKey: ["/api/integrations/drive/sync-log"], refetchInterval: 20_000 },
  });

  const cfg = status.data?.config;
  const connected = status.data?.connected === true;
  const configured = status.data?.configured === true;

  const [rootFolderId, setRootFolderId] = useState<string>("");
  const [createName, setCreateName] = useState<string>("");
  const [visibilityPolicy, setVisibilityPolicy] = useState<"private" | "anyone_with_link">(
    "anyone_with_link",
  );
  const [deletePolicy, setDeletePolicy] = useState<"trash" | "hard_delete">("trash");

  // Hydrate selectors from server config when status loads.
  useEffect(() => {
    if (cfg?.rootFolderId && !rootFolderId) setRootFolderId(cfg.rootFolderId);
    if (cfg?.visibilityPolicy) setVisibilityPolicy(cfg.visibilityPolicy);
    if (cfg?.deletePolicy) setDeletePolicy(cfg.deletePolicy);
  }, [cfg, rootFolderId]);

  // Only fetch the folder list once we know the connector is reachable —
  // otherwise every poll generates a 412 and noisy console spam.
  const folders = useListDriveFolders(
    {},
    {
      query: {
        queryKey: ["/api/integrations/drive/folders"],
        enabled: connected,
        refetchOnWindowFocus: false,
      },
    },
  );

  const configure = useConfigureDrive();
  const disconnect = useDisconnectDrive();
  const backfill = useBackfillDriveDocuments();

  const onSave = async () => {
    if (!rootFolderId && !createName) {
      toast({
        title: t("Pick a folder", "Selecciona una carpeta"),
        description: t(
          "Choose an existing Drive folder or enter a name to create a new one.",
          "Elige una carpeta existente o ingresa un nombre para crear una nueva.",
        ),
        variant: "destructive",
      });
      return;
    }
    try {
      const folderName = folders.data?.folders?.find((f) => f.id === rootFolderId)?.name;
      await configure.mutateAsync({
        data: {
          ...(rootFolderId ? { rootFolderId } : {}),
          ...(folderName ? { rootFolderName: folderName } : {}),
          ...(createName ? { createName } : {}),
          visibilityPolicy,
          deletePolicy,
        },
      });
      setCreateName("");
      toast({
        title: t("Drive connected", "Drive conectado"),
        description: t(
          "New uploads will be stored in your KONTi Drive folder.",
          "Las nuevas cargas se almacenarán en tu carpeta de KONTi en Drive.",
        ),
      });
      await Promise.all([status.refetch(), syncLog.refetch(), folders.refetch()]);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "configure_failed";
      toast({
        title: t("Could not save", "No se pudo guardar"),
        description: msg,
        variant: "destructive",
      });
    }
  };

  const onDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      setRootFolderId("");
      setCreateName("");
      await status.refetch();
      toast({
        title: t("Drive disconnected", "Drive desconectado"),
        description: t(
          "New uploads will stay in the dashboard until reconnected.",
          "Las nuevas cargas permanecerán en el panel hasta reconectar.",
        ),
      });
    } catch {
      toast({
        title: t("Disconnect failed", "Error al desconectar"),
        variant: "destructive",
      });
    }
  };

  const onBackfill = async () => {
    try {
      const res = await backfill.mutateAsync();
      const s = res.summary;
      toast({
        title: t("Backfill complete", "Migración completa"),
        description: t(
          `${s.uploaded} uploaded · ${s.skipped} skipped · ${s.failed} failed`,
          `${s.uploaded} subidos · ${s.skipped} omitidos · ${s.failed} fallidos`,
        ),
      });
      await syncLog.refetch();
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "backfill_failed";
      toast({
        title: t("Backfill failed", "Migración fallida"),
        description: msg,
        variant: "destructive",
      });
    }
  };

  const banner = useMemo(() => {
    if (status.isLoading) {
      return {
        tone: "info" as const,
        icon: Loader2,
        text: t("Checking Drive connection…", "Verificando conexión con Drive…"),
      };
    }
    if (!connected) {
      return {
        tone: "warn" as const,
        icon: AlertTriangle,
        text:
          status.data?.connectionMessage ??
          t(
            "Drive is not connected. Authorize via the workspace Connectors panel.",
            "Drive no está conectado. Autorízalo desde el panel de conectores.",
          ),
      };
    }
    if (!configured) {
      return {
        tone: "warn" as const,
        icon: AlertTriangle,
        text: t(
          "Connected, but no folder chosen yet. Pick or create a Drive folder below.",
          "Conectado, pero aún no eliges carpeta. Selecciona o crea una carpeta abajo.",
        ),
      };
    }
    return {
      tone: "ok" as const,
      icon: CheckCircle2,
      text: t(
        `Storing uploads in “${cfg?.rootFolderName ?? cfg?.rootFolderId}”.`,
        `Almacenando cargas en "${cfg?.rootFolderName ?? cfg?.rootFolderId}".`,
      ),
    };
  }, [status.isLoading, status.data, connected, configured, cfg, t]);

  const Icon = banner.icon;
  const bannerClass =
    banner.tone === "ok"
      ? "bg-green-50 text-green-900 border-green-200"
      : banner.tone === "warn"
        ? "bg-yellow-50 text-yellow-900 border-yellow-200"
        : "bg-blue-50 text-blue-900 border-blue-200";

  return (
    <div className="border border-border rounded-lg p-4 sm:p-6 bg-card" data-testid="drive-integration-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-md bg-konti-olive/10 flex items-center justify-center text-konti-olive">
          <HardDrive className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("Google Drive storage", "Almacenamiento en Google Drive")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Store project documents and photos in your team's Google Drive.",
              "Almacena documentos y fotos de proyectos en el Google Drive del equipo.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void status.refetch();
            void syncLog.refetch();
          }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="drive-refresh-status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.isFetching ? "animate-spin" : ""}`} />
          {t("Refresh", "Actualizar")}
        </button>
      </div>

      <div
        className={`flex items-start gap-2 border rounded-md px-3 py-2 mb-4 text-sm ${bannerClass}`}
        data-testid="drive-status-banner"
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${banner.tone === "info" ? "animate-spin" : ""}`} />
        <span>{banner.text}</span>
      </div>

      {connected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="drive-folder" className="text-xs">
              {t("Existing folder", "Carpeta existente")}
            </Label>
            <select
              id="drive-folder"
              data-testid="drive-folder-select"
              value={rootFolderId}
              onChange={(e) => {
                setRootFolderId(e.target.value);
                if (e.target.value) setCreateName("");
              }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">
                {folders.isLoading
                  ? t("Loading folders…", "Cargando carpetas…")
                  : t("Select folder…", "Selecciona carpeta…")}
              </option>
              {(folders.data?.folders ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="drive-create-name" className="text-xs">
              <FolderPlus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              {t("…or create a new folder under My Drive", "…o crea una nueva carpeta en Mi unidad")}
            </Label>
            <Input
              id="drive-create-name"
              data-testid="drive-create-name-input"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (e.target.value) setRootFolderId("");
              }}
              placeholder="KONTi Dashboard"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="drive-visibility" className="text-xs">
              {t("Client-visible files", "Archivos visibles al cliente")}
            </Label>
            <select
              id="drive-visibility"
              data-testid="drive-visibility-select"
              value={visibilityPolicy}
              onChange={(e) => setVisibilityPolicy(e.target.value as "private" | "anyone_with_link")}
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="anyone_with_link">{t("Anyone with link", "Cualquiera con el enlace")}</option>
              <option value="private">{t("Private (proxy)", "Privado (proxy)")}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="drive-delete" className="text-xs">
              {t("On delete", "Al eliminar")}
            </Label>
            <select
              id="drive-delete"
              data-testid="drive-delete-select"
              value={deletePolicy}
              onChange={(e) => setDeletePolicy(e.target.value as "trash" | "hard_delete")}
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="trash">{t("Move to Drive trash", "Mover a la papelera de Drive")}</option>
              <option value="hard_delete">{t("Permanently delete", "Eliminar permanentemente")}</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <Button onClick={onSave} disabled={configure.isPending} data-testid="drive-save-config">
              {configure.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
            </Button>
            {configured && (
              <>
                <Button
                  variant="outline"
                  onClick={onBackfill}
                  disabled={backfill.isPending}
                  data-testid="drive-backfill"
                >
                  <CloudUpload className="w-3.5 h-3.5 mr-1" />
                  {backfill.isPending ? t("Migrating…", "Migrando…") : t("Backfill existing docs", "Migrar documentos existentes")}
                </Button>
                <Button
                  variant="outline"
                  onClick={onDisconnect}
                  disabled={disconnect.isPending}
                  data-testid="drive-disconnect"
                >
                  <Unlink2 className="w-3.5 h-3.5 mr-1" />
                  {t("Disconnect", "Desconectar")}
                </Button>
              </>
            )}
            {cfg?.connectedAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t("Connected:", "Conectado:")} {new Date(cfg.connectedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {connected && (syncLog.data?.entries?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground mb-2">
            {t("Recent Drive activity", "Actividad reciente de Drive")}
          </h4>
          <div className="space-y-1 max-h-72 overflow-y-auto" data-testid="drive-sync-log">
            {(syncLog.data?.entries ?? []).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 text-xs border border-border rounded px-2 py-1.5"
                data-testid={`drive-sync-entry-${entry.id}`}
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                    entry.status === "ok"
                      ? "bg-green-100 text-green-800"
                      : entry.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {entry.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{entry.action}</span>
                    {entry.documentName && (
                      <span className="text-muted-foreground"> · {entry.documentName}</span>
                    )}
                    {entry.projectName && (
                      <span className="text-muted-foreground"> · {entry.projectName}</span>
                    )}
                  </div>
                  {entry.message && entry.status !== "ok" && (
                    <div className="text-red-700 truncate" title={entry.message}>
                      {entry.message}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
