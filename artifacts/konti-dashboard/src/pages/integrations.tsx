// Superadmin Integrations page (Task #130).
//
// Lives at /integrations and is gated to role === "superadmin" both in the
// sidebar (`superadminOnly` flag) and on this page itself (RequireRole). The
// page consolidates three concerns:
//
//   1. Managed API keys (Anthropic, OpenAI, PDF.co, Gamma) with Update +
//      Test buttons. Updates persist to the encrypted override store; Test
//      runs a low-cost auth probe and returns ok / error.
//   2. Drive + Asana panels (re-used) plus per-integration "Restart" button
//      which forces a fresh OAuth token + health probe via the connector
//      proxy.
//   3. Audit log of the last 50 superadmin actions (rotations, restarts).

import { useState } from "react";
import {
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Pencil,
  Trash2,
  Activity,
} from "lucide-react";
import {
  useListManagedSecrets,
  useUpdateManagedSecret,
  useTestManagedSecret,
  useRestartIntegration,
  useListSuperadminAudit,
  type ManagedSecretStatus,
  type SecretTestResult,
  type SuperadminAuditEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RequireRole } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AsanaIntegrationPanel } from "@/components/asana-integration-panel";
import { DriveIntegrationPanel } from "@/components/drive-integration-panel";

const SECRETS_QK = ["/api/admin/secrets"] as const;
const AUDIT_QK = ["/api/admin/audit-log"] as const;

export default function IntegrationsPage() {
  return (
    <RequireRole roles={["superadmin"]}>
      <AppLayout>
        <IntegrationsPageBody />
      </AppLayout>
    </RequireRole>
  );
}

function IntegrationsPageBody() {
  const { t } = useLang();
  return (
    <div className="space-y-6" data-testid="integrations-page">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-konti-olive" />
          {t("Integrations", "Integraciones")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "Superadmin-only: manage API keys, restart connectors, and audit recent changes.",
            "Solo superadmin: administra llaves API, reinicia conectores y audita cambios recientes.",
          )}
        </p>
      </header>

      <ApiKeysSection />
      <ConnectorsSection />
      <AuditSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

function ApiKeysSection() {
  const { t } = useLang();
  const list = useListManagedSecrets({
    query: { queryKey: [...SECRETS_QK], refetchOnWindowFocus: false },
  });
  const secrets = list.data?.secrets ?? [];

  return (
    <section
      className="bg-card rounded-xl border border-card-border shadow-sm p-6"
      data-testid="section-api-keys"
    >
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-4">
        <KeyRound className="w-4 h-4" />
        {t("API keys", "Llaves API")}
      </h2>

      {list.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("Loading…", "Cargando…")}
        </div>
      )}

      {list.isError && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {t("Failed to load secrets.", "No se pudieron cargar las llaves.")}
        </div>
      )}

      {!list.isPending && secrets.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm" data-testid="table-secrets">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="px-2 py-2">{t("Key", "Llave")}</th>
                <th className="px-2 py-2">{t("Source", "Origen")}</th>
                <th className="px-2 py-2">{t("Preview", "Vista previa")}</th>
                <th className="px-2 py-2">{t("Last update", "Última actualización")}</th>
                <th className="px-2 py-2 text-right">{t("Actions", "Acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => (
                <SecretRow key={s.meta.name} secret={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SecretRow({ secret }: { secret: ManagedSecretStatus }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [testResult, setTestResult] = useState<SecretTestResult | null>(null);

  const test = useTestManagedSecret();
  const update = useUpdateManagedSecret();

  const meta = secret.meta;
  const sourceBadge =
    secret.source === "override"
      ? { en: "Override", es: "Sustitución", cls: "bg-konti-olive text-white" }
      : secret.source === "env"
        ? { en: "Replit Secret", es: "Replit Secret", cls: "bg-blue-100 text-blue-800" }
        : { en: "Missing", es: "Faltante", cls: "bg-amber-100 text-amber-800" };

  const onTest = async () => {
    setTestResult(null);
    try {
      // Empty body -> probe the currently stored value (live test).
      const result = await test.mutateAsync({ name: meta.name, data: {} });
      setTestResult(result);
      toast({
        title: result.ok ? t("Test passed", "Prueba exitosa") : t("Test failed", "Prueba falló"),
        description: lang === "es" ? (result.messageEs ?? result.message) : result.message,
        variant: result.ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: AUDIT_QK });
    } catch (err) {
      const msg = (err as Error).message ?? "Test failed";
      setTestResult({ ok: false, message: msg });
      toast({ title: t("Test failed", "Prueba falló"), description: msg, variant: "destructive" });
    }
  };

  const onClear = async () => {
    try {
      await update.mutateAsync({ name: meta.name, data: { clear: true } });
      toast({
        title: t("Override cleared", "Sustitución eliminada"),
        description: t(
          "Reverted to the Replit Secret value (if any).",
          "Se revirtió al valor del Replit Secret (si existe).",
        ),
      });
      queryClient.invalidateQueries({ queryKey: SECRETS_QK });
      queryClient.invalidateQueries({ queryKey: AUDIT_QK });
    } catch (err) {
      toast({
        title: t("Failed", "Falló"),
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30"
        data-testid={`secret-row-${meta.name}`}
      >
        <td className="px-2 py-3 align-top">
          <div className="font-medium text-foreground">{lang === "es" ? meta.labelEs : meta.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
            {lang === "es" ? meta.descriptionEs : meta.description}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{meta.name}</div>
        </td>
        <td className="px-2 py-3 align-top">
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadge.cls}`}>
            {lang === "es" ? sourceBadge.es : sourceBadge.en}
          </span>
        </td>
        <td className="px-2 py-3 align-top font-mono text-xs text-muted-foreground">
          {secret.preview || "—"}
        </td>
        <td className="px-2 py-3 align-top text-xs text-muted-foreground">
          {secret.overrideUpdatedAt
            ? new Date(secret.overrideUpdatedAt).toLocaleString()
            : "—"}
        </td>
        <td className="px-2 py-3 align-top">
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={test.isPending}
              data-testid={`btn-test-${meta.name}`}
              title={
                meta.testable
                  ? t("Run live probe", "Probar en vivo")
                  : t("Test not yet wired", "Prueba aún no conectada")
              }
            >
              {test.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span className="ml-1">{t("Test", "Probar")}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              data-testid={`btn-update-${meta.name}`}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" />
              {t("Update", "Actualizar")}
            </Button>
            {secret.source === "override" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClear}
                disabled={update.isPending}
                title={t("Clear override", "Eliminar sustitución")}
                data-testid={`btn-clear-${meta.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          {testResult && (
            <div
              className={`mt-1 text-[10px] flex items-start gap-1 justify-end ${testResult.ok ? "text-konti-olive" : "text-destructive"}`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              )}
              <span className="text-right max-w-[14rem]">
                {lang === "es" ? (testResult.messageEs ?? testResult.message) : testResult.message}
              </span>
            </div>
          )}
        </td>
      </tr>

      <UpdateSecretDialog
        secret={secret}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function UpdateSecretDialog({
  secret,
  open,
  onOpenChange,
}: {
  secret: ManagedSecretStatus;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [candidateResult, setCandidateResult] =
    useState<SecretTestResult | null>(null);
  const update = useUpdateManagedSecret();
  const test = useTestManagedSecret();
  const meta = secret.meta;

  // Reset transient state whenever the dialog closes — never leak the
  // pasted value or stale test result across opens.
  const closeDialog = (next: boolean) => {
    if (!next) {
      setValue("");
      setCandidateResult(null);
    }
    onOpenChange(next);
  };

  const onTestCandidate = async () => {
    const v = value.trim();
    if (!v) {
      toast({
        title: t("Missing value", "Valor faltante"),
        description: t(
          "Paste a value to test before saving.",
          "Pega un valor para probar antes de guardar.",
        ),
        variant: "destructive",
      });
      return;
    }
    setCandidateResult(null);
    try {
      // Candidate-value flow: server probes WITHOUT persisting.
      const result = await test.mutateAsync({
        name: meta.name,
        data: { value: v },
      });
      setCandidateResult(result);
      queryClient.invalidateQueries({ queryKey: AUDIT_QK });
    } catch (err) {
      const msg = (err as Error).message ?? "Test failed";
      setCandidateResult({ ok: false, message: msg });
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      toast({
        title: t("Missing value", "Valor faltante"),
        description: t("Paste the new secret value.", "Pega el valor de la nueva llave."),
        variant: "destructive",
      });
      return;
    }
    try {
      await update.mutateAsync({ name: meta.name, data: { value: v } });
      toast({
        title: t("Updated", "Actualizado"),
        description: t(
          `Override stored for ${meta.name}.`,
          `Sustitución guardada para ${meta.name}.`,
        ),
      });
      setValue("");
      setCandidateResult(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: SECRETS_QK });
      queryClient.invalidateQueries({ queryKey: AUDIT_QK });
    } catch (err) {
      toast({
        title: t("Failed to update", "No se pudo actualizar"),
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent data-testid={`dialog-update-${meta.name}`}>
        <DialogHeader>
          <DialogTitle>
            {t("Update key", "Actualizar llave")}: {lang === "es" ? meta.labelEs : meta.label}
          </DialogTitle>
          <DialogDescription>
            {t(
              "The new value is stored encrypted on the server. The old value is overwritten — there is no recovery.",
              "El nuevo valor se guarda cifrado en el servidor. El valor anterior se sobrescribe — no hay recuperación.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor={`secret-input-${meta.name}`}>
              {t("New value", "Nuevo valor")}
              {meta.formatHint ? ` (${meta.formatHint})` : ""}
            </Label>
            <Input
              id={`secret-input-${meta.name}`}
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                // Invalidate the previous candidate result so the operator
                // never confuses an old probe with the value they're about
                // to save.
                if (candidateResult) setCandidateResult(null);
              }}
              placeholder={meta.formatHint ?? ""}
              data-testid={`input-value-${meta.name}`}
            />
            <p className="text-xs text-muted-foreground mt-1">{meta.name}</p>
          </div>

          {/* Test-before-Save: only useful for keys with a wired probe. */}
          {meta.testable && (
            <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t(
                    "Optionally probe the pasted value before saving.",
                    "Opcionalmente prueba el valor pegado antes de guardar.",
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onTestCandidate}
                  disabled={test.isPending || value.trim().length === 0}
                  data-testid={`btn-test-candidate-${meta.name}`}
                >
                  {test.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1">
                    {t("Test value", "Probar valor")}
                  </span>
                </Button>
              </div>
              {candidateResult && (
                <p
                  className={`text-[11px] flex items-start gap-1 ${
                    candidateResult.ok
                      ? "text-konti-olive"
                      : "text-destructive"
                  }`}
                  data-testid={`candidate-result-${meta.name}`}
                >
                  {candidateResult.ok ? (
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  )}
                  <span>
                    {lang === "es"
                      ? (candidateResult.messageEs ?? candidateResult.message)
                      : candidateResult.message}
                  </span>
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>
              {t("Cancel", "Cancelar")}
            </Button>
            <Button
              type="submit"
              disabled={update.isPending}
              data-testid={`btn-save-${meta.name}`}
            >
              {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              {t("Save", "Guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Connectors (Drive + Asana) with restart
// ---------------------------------------------------------------------------

function ConnectorsSection() {
  const { t } = useLang();
  return (
    <section className="space-y-6" data-testid="section-connectors">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <RefreshCw className="w-4 h-4" />
        {t("OAuth connectors", "Conectores OAuth")}
      </h2>

      <div className="bg-card rounded-xl border border-card-border shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("Google Drive", "Google Drive")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "Document storage, project folders, and PDF previews.",
                "Almacenamiento de documentos, carpetas de proyecto y vistas previas de PDFs.",
              )}
            </p>
          </div>
          <RestartButton name="drive" />
        </div>
        <DriveIntegrationPanel />
      </div>

      <div className="bg-card rounded-xl border border-card-border shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("Asana", "Asana")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "Task sync — activity feed mirrors into the chosen Asana board.",
                "Sincronización de tareas — el feed de actividad se refleja en el tablero de Asana elegido.",
              )}
            </p>
          </div>
          <RestartButton name="asana" />
        </div>
        <AsanaIntegrationPanel />
      </div>
    </section>
  );
}

function RestartButton({ name }: { name: "drive" | "asana" }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SecretTestResult | null>(null);
  const restart = useRestartIntegration();

  const onClick = async () => {
    setResult(null);
    try {
      const r = await restart.mutateAsync({ name });
      setResult(r);
      toast({
        title: r.ok
          ? t("Connector restarted", "Conector reiniciado")
          : t("Restart failed", "Reinicio falló"),
        description: lang === "es" ? (r.messageEs ?? r.message) : r.message,
        variant: r.ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: AUDIT_QK });
    } catch (err) {
      const msg = (err as Error).message;
      setResult({ ok: false, message: msg });
      toast({
        title: t("Restart failed", "Reinicio falló"),
        description: msg,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={restart.isPending}
        data-testid={`btn-restart-${name}`}
      >
        {restart.isPending ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
        )}
        {t("Restart", "Reiniciar")}
      </Button>
      {result && (
        <div
          className={`text-[10px] flex items-start gap-1 max-w-[16rem] text-right ${result.ok ? "text-konti-olive" : "text-destructive"}`}
        >
          {result.ok ? (
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          <span>{lang === "es" ? (result.messageEs ?? result.message) : result.message}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function AuditSection() {
  const { t, lang } = useLang();
  const audit = useListSuperadminAudit({
    query: { queryKey: [...AUDIT_QK], refetchInterval: 15_000 },
  });
  const entries = audit.data?.entries ?? [];

  return (
    <section
      className="bg-card rounded-xl border border-card-border shadow-sm p-6"
      data-testid="section-audit-log"
    >
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4" />
        {t("Recent superadmin activity", "Actividad reciente de superadmin")}
        <span className="text-[10px] font-normal text-muted-foreground ml-auto">
          {t(`Last ${entries.length} of 50`, `Últimas ${entries.length} de 50`)}
        </span>
      </h2>

      {audit.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("Loading…", "Cargando…")}
        </div>
      )}

      {!audit.isPending && entries.length === 0 && (
        <div className="text-sm text-muted-foreground italic">
          {t("No actions recorded yet.", "Sin acciones registradas.")}
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm" data-testid="table-audit-log">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="px-2 py-2">{t("When", "Cuándo")}</th>
                <th className="px-2 py-2">{t("Actor", "Actor")}</th>
                <th className="px-2 py-2">{t("Action", "Acción")}</th>
                <th className="px-2 py-2">{t("Target", "Objetivo")}</th>
                <th className="px-2 py-2">{t("Message", "Mensaje")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <AuditRow key={e.id} entry={e} lang={lang} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditRow({ entry, lang }: { entry: SuperadminAuditEntry; lang: "en" | "es" }) {
  const failed = entry.action.endsWith("_failed");
  return (
    <tr className="border-b border-border" data-testid={`audit-row-${entry.id}`}>
      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(entry.timestamp).toLocaleString()}
      </td>
      <td className="px-2 py-2 text-xs text-foreground">{entry.actorEmail}</td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            failed ? "bg-red-100 text-red-800" : "bg-konti-olive/10 text-konti-olive"
          }`}
        >
          {failed ? <AlertTriangle className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
          {entry.action}
        </span>
      </td>
      <td className="px-2 py-2 text-xs font-mono text-muted-foreground">{entry.target}</td>
      <td className="px-2 py-2 text-xs text-foreground">
        {lang === "es" ? entry.messageEs : entry.message}
      </td>
    </tr>
  );
}
