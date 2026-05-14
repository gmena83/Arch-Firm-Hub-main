import { useEffect, useMemo, useState } from "react";
import { Plug, RefreshCw, AlertTriangle, CheckCircle2, Loader2, RotateCcw, Unlink2 } from "lucide-react";
import {
  useGetAsanaStatus,
  useListAsanaWorkspaces,
  useListAsanaBoards,
  useConfigureAsana,
  useDisconnectAsana,
  useGetAsanaSyncLog,
  useRetryAsanaSyncEntry,
  type AsanaSyncLogEntry,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Task #127 — Bidirectional Asana sync.
 *
 * Renders the admin/superadmin Asana integration controls inside Settings:
 *   1. Connection status banner (connected? configured?).
 *   2. Workspace + board pickers (only fetched once a connection exists).
 *   3. Optional default-assignee gid override.
 *   4. Recent sync log (capped at 50 entries) with manual retry.
 */
export function AsanaIntegrationPanel() {
  const { t } = useLang();
  const { toast } = useToast();

  const status = useGetAsanaStatus({
    query: { queryKey: ["/api/integrations/asana/status"], refetchOnWindowFocus: false },
  });
  const syncLog = useGetAsanaSyncLog({
    query: { queryKey: ["/api/integrations/asana/sync-log"], refetchInterval: 15_000 },
  });

  const cfg = status.data?.config;
  const connected = status.data?.connected === true;
  const configured = cfg?.enabled === true && Boolean(cfg?.workspaceGid) && Boolean(cfg?.boardGid);
  const queueLength = syncLog.data?.queueLength ?? 0;

  const [workspaceGid, setWorkspaceGid] = useState<string>("");
  const [boardGid, setBoardGid] = useState<string>("");
  const [assigneeGid, setAssigneeGid] = useState<string>("");

  // Hydrate selectors from server config when status loads.
  useEffect(() => {
    if (cfg?.workspaceGid && !workspaceGid) setWorkspaceGid(cfg.workspaceGid);
    if (cfg?.boardGid && !boardGid) setBoardGid(cfg.boardGid);
    if (cfg?.defaultAssigneeGid && !assigneeGid) setAssigneeGid(cfg.defaultAssigneeGid);
  }, [cfg, workspaceGid, boardGid, assigneeGid]);

  const workspaces = useListAsanaWorkspaces({
    query: {
      queryKey: ["/api/integrations/asana/workspaces"],
      enabled: connected,
      refetchOnWindowFocus: false,
    },
  });
  const boards = useListAsanaBoards(
    { workspaceGid },
    {
      query: {
        queryKey: ["/api/integrations/asana/boards", workspaceGid],
        enabled: connected && Boolean(workspaceGid),
        refetchOnWindowFocus: false,
      },
    },
  );

  const configure = useConfigureAsana();
  const disconnect = useDisconnectAsana();
  const retry = useRetryAsanaSyncEntry();

  const onSave = async () => {
    if (!workspaceGid || !boardGid) {
      toast({
        title: t("Missing selection", "Selección incompleta"),
        description: t("Pick a workspace and board before saving.", "Selecciona un espacio de trabajo y un tablero."),
        variant: "destructive",
      });
      return;
    }
    try {
      // Pluck the names from the workspace/board lists so the server can show
      // them in the status banner without hitting Asana again.
      const wsName = workspaces.data?.workspaces?.find((w) => w.gid === workspaceGid)?.name;
      const boardName = boards.data?.boards?.find((b) => b.gid === boardGid)?.name;
      await configure.mutateAsync({
        data: {
          workspaceGid,
          boardGid,
          ...(wsName ? { workspaceName: wsName } : {}),
          ...(boardName ? { boardName } : {}),
          ...(assigneeGid ? { defaultAssigneeGid: assigneeGid } : {}),
        },
      });
      toast({
        title: t("Asana connected", "Asana conectado"),
        description: t("Future activity will mirror to your selected board.", "La actividad futura se reflejará en tu tablero."),
      });
      await Promise.all([status.refetch(), syncLog.refetch()]);
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
      setWorkspaceGid("");
      setBoardGid("");
      setAssigneeGid("");
      await status.refetch();
      toast({
        title: t("Asana disconnected", "Asana desconectado"),
        description: t("Activity will no longer sync until you reconnect.", "La actividad dejará de sincronizarse hasta reconectar."),
      });
    } catch {
      toast({
        title: t("Disconnect failed", "Error al desconectar"),
        variant: "destructive",
      });
    }
  };

  const onRetry = async (entry: AsanaSyncLogEntry) => {
    try {
      await retry.mutateAsync({ id: entry.id });
      await syncLog.refetch();
      toast({ title: t("Retry queued", "Reintento encolado") });
    } catch {
      toast({
        title: t("Retry failed", "Reintento falló"),
        variant: "destructive",
      });
    }
  };

  const banner = useMemo(() => {
    if (status.isLoading) {
      return {
        tone: "info" as const,
        icon: Loader2,
        text: t("Checking Asana connection…", "Verificando conexión con Asana…"),
      };
    }
    if (!connected) {
      return {
        tone: "warn" as const,
        icon: AlertTriangle,
        text: t(
          "Asana is not connected. Connect via the workspace Connectors panel, then return here to pick a board.",
          "Asana no está conectado. Conéctalo desde el panel de conectores del workspace y regresa aquí para elegir un tablero.",
        ),
      };
    }
    if (!configured) {
      return {
        tone: "warn" as const,
        icon: AlertTriangle,
        text: t(
          "Connected, but no board chosen yet. Pick a workspace + board below to start mirroring activity.",
          "Conectado, pero aún no eliges un tablero. Selecciona un espacio y tablero para empezar a reflejar la actividad.",
        ),
      };
    }
    return {
      tone: "ok" as const,
      icon: CheckCircle2,
      text: t(
        `Mirroring to “${cfg?.boardName ?? boardGid}” in “${cfg?.workspaceName ?? workspaceGid}”.`,
        `Reflejando a "${cfg?.boardName ?? boardGid}" en "${cfg?.workspaceName ?? workspaceGid}".`,
      ),
    };
  }, [status.isLoading, connected, configured, cfg, boardGid, workspaceGid, t]);

  const Icon = banner.icon;
  const bannerClass =
    banner.tone === "ok"
      ? "bg-green-50 text-green-900 border-green-200"
      : banner.tone === "warn"
        ? "bg-yellow-50 text-yellow-900 border-yellow-200"
        : "bg-blue-50 text-blue-900 border-blue-200";

  return (
    <div className="border border-border rounded-lg p-4 sm:p-6 bg-card" data-testid="asana-integration-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-md bg-konti-olive/10 flex items-center justify-center text-konti-olive">
          <Plug className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("Asana sync", "Sincronización con Asana")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Mirror dashboard activity to your team's Asana board.",
              "Refleja la actividad del panel en el tablero Asana de tu equipo.",
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
          data-testid="asana-refresh-status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.isFetching ? "animate-spin" : ""}`} />
          {t("Refresh", "Actualizar")}
        </button>
      </div>

      <div className={`flex items-start gap-2 border rounded-md px-3 py-2 mb-4 text-sm ${bannerClass}`} data-testid="asana-status-banner">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${banner.tone === "info" ? "animate-spin" : ""}`} />
        <span>{banner.text}</span>
      </div>

      {connected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="asana-workspace" className="text-xs">
              {t("Workspace", "Espacio de trabajo")}
            </Label>
            <select
              id="asana-workspace"
              data-testid="asana-workspace-select"
              value={workspaceGid}
              onChange={(e) => {
                setWorkspaceGid(e.target.value);
                setBoardGid("");
              }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">{t("Select workspace…", "Selecciona espacio…")}</option>
              {(workspaces.data?.workspaces ?? []).map((w) => (
                <option key={w.gid} value={w.gid}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="asana-board" className="text-xs">
              {t("Board", "Tablero")}
            </Label>
            <select
              id="asana-board"
              data-testid="asana-board-select"
              value={boardGid}
              onChange={(e) => setBoardGid(e.target.value)}
              disabled={!workspaceGid || boards.isLoading}
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-50"
            >
              <option value="">{t("Select board…", "Selecciona tablero…")}</option>
              {(boards.data?.boards ?? []).map((b) => (
                <option key={b.gid} value={b.gid}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="asana-assignee" className="text-xs">
              {t("Default assignee gid (optional)", "Asignado por defecto (opcional)")}
            </Label>
            <Input
              id="asana-assignee"
              data-testid="asana-assignee-input"
              value={assigneeGid}
              onChange={(e) => setAssigneeGid(e.target.value)}
              placeholder="1209876543210"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <Button onClick={onSave} disabled={configure.isPending} data-testid="asana-save-config">
              {configure.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
            </Button>
            {configured && (
              <Button
                variant="outline"
                onClick={onDisconnect}
                disabled={disconnect.isPending}
                data-testid="asana-disconnect"
              >
                <Unlink2 className="w-3.5 h-3.5 mr-1" />
                {t("Disconnect", "Desconectar")}
              </Button>
            )}
            {cfg?.connectedAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t("Connected:", "Conectado:")} {new Date(cfg.connectedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sync log */}
      {connected && (syncLog.data?.entries?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground mb-2">
            {t("Recent sync activity", "Actividad reciente de sincronización")}
            {queueLength > 0 && (
              <span className="ml-2 text-xs font-normal text-yellow-700">
                ({queueLength} {t("pending retries", "reintentos pendientes")})
              </span>
            )}
          </h4>
          <div className="space-y-1 max-h-72 overflow-y-auto" data-testid="asana-sync-log">
            {(syncLog.data?.entries ?? []).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 text-xs border border-border rounded px-2 py-1.5"
                data-testid={`asana-sync-entry-${entry.id}`}
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                    entry.status === "ok"
                      ? "bg-green-100 text-green-800"
                      : entry.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : entry.status === "retried"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {entry.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{entry.activityType}</span>
                    <span className="text-muted-foreground"> · {entry.projectName || entry.projectId}</span>
                    {entry.asanaTaskGid && (
                      <span className="text-muted-foreground"> · gid {entry.asanaTaskGid}</span>
                    )}
                  </div>
                  {entry.message && entry.status !== "ok" && (
                    <div className="text-red-700 truncate" title={entry.message}>
                      {entry.message}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()} · {t("attempts", "intentos")}: {entry.attempts}
                  </div>
                </div>
                {entry.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => void onRetry(entry)}
                    disabled={retry.isPending}
                    className="text-konti-olive hover:underline inline-flex items-center gap-1"
                    data-testid={`asana-sync-retry-${entry.id}`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("Retry", "Reintentar")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
