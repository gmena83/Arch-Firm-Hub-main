import { useState } from "react";
import { MapPinned, MessageCircle, Link2, X, Loader2, CheckCircle2 } from "lucide-react";
import {
  useLogProjectSiteVisit,
  useLogProjectClientInteraction,
  useListProjectAsanaCandidates,
  useLinkProjectToAsanaTask,
  useGetAsanaStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Task #127 — Three quick-action buttons exposed to team users on the Project
 * Detail page:
 *
 *   1. "Log site visit"        → POST /projects/:id/site-visits
 *   2. "Log client interaction" → POST /projects/:id/client-interactions
 *   3. "Link to Asana task"     → GET candidates + POST /asana-link
 *
 * Each button opens an inline modal. We invalidate the project & activity
 * query keys after success so the activity feed picks up the new entry.
 */
export function ProjectTeamActions({
  projectId,
  actor,
  asanaGid,
}: {
  projectId: string;
  actor: string;
  asanaGid?: string | null | undefined;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState<"visit" | "interaction" | "link" | null>(null);

  const status = useGetAsanaStatus({
    query: { queryKey: ["/api/integrations/asana/status"], refetchOnWindowFocus: false, staleTime: 60_000 },
  });
  // Backend computes `configured` from enabled + workspaceGid + boardGid. The
  // "Link to Asana task" button only makes sense once a board is configured.
  const asanaConfigured = status.data?.configured === true;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="project-team-actions">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen("visit")}
          data-testid="btn-log-site-visit"
        >
          <MapPinned className="w-3.5 h-3.5 mr-1" />
          {t("Log site visit", "Registrar visita al sitio")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen("interaction")}
          data-testid="btn-log-client-interaction"
        >
          <MessageCircle className="w-3.5 h-3.5 mr-1" />
          {t("Log client contact", "Registrar contacto cliente")}
        </Button>
        {asanaConfigured && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen("link")}
            data-testid="btn-link-asana"
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {asanaGid ? t("Re-link Asana task", "Re-vincular tarea Asana") : t("Link Asana task", "Vincular tarea Asana")}
          </Button>
        )}
      </div>

      {open === "visit" && (
        <SiteVisitModal projectId={projectId} actor={actor} onClose={() => setOpen(null)} />
      )}
      {open === "interaction" && (
        <ClientInteractionModal projectId={projectId} actor={actor} onClose={() => setOpen(null)} />
      )}
      {open === "link" && (
        <AsanaLinkModal projectId={projectId} onClose={() => setOpen(null)} currentGid={asanaGid ?? null} />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Modal shell
// -----------------------------------------------------------------------------
function ModalShell({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid={testId}>
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} data-testid={`${testId}-close`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Site visit
// -----------------------------------------------------------------------------
function SiteVisitModal({
  projectId,
  actor,
  onClose,
}: {
  projectId: string;
  actor: string;
  onClose: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Default visitor to the logged-in user; admin can edit to a contractor.
  const [visitor, setVisitor] = useState<string>(actor);
  const [visitDate, setVisitDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState<"site" | "remote">("site");
  const [note, setNote] = useState("");
  const log = useLogProjectSiteVisit();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitor.trim() || !visitDate.trim()) return;
    try {
      await log.mutateAsync({
        projectId,
        data: {
          visitor: visitor.trim(),
          visitDate: visitDate.trim(),
          channel,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pre-design`] });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: t("Site visit logged", "Visita registrada"),
        description: t("Activity recorded for this project.", "Actividad registrada para este proyecto."),
      });
      onClose();
    } catch {
      toast({ title: t("Could not log visit", "No se pudo registrar"), variant: "destructive" });
    }
  };

  return (
    <ModalShell title={t("Log site visit", "Registrar visita al sitio")} onClose={onClose} testId="site-visit-modal">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="sv-visitor" className="text-xs">
            {t("Visitor", "Visitante")} *
          </Label>
          <Input
            id="sv-visitor"
            required
            value={visitor}
            onChange={(e) => setVisitor(e.target.value)}
            data-testid="site-visit-visitor"
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="sv-date" className="text-xs">
              {t("Date", "Fecha")} *
            </Label>
            <Input
              id="sv-date"
              type="date"
              required
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              data-testid="site-visit-date"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="sv-channel" className="text-xs">
              {t("Channel", "Canal")}
            </Label>
            <select
              id="sv-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as "site" | "remote")}
              data-testid="site-visit-channel"
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="site">{t("On-site", "En sitio")}</option>
              <option value="remote">{t("Remote check", "Revisión remota")}</option>
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="sv-note" className="text-xs">
            {t("Note (optional)", "Nota (opcional)")}
          </Label>
          <textarea
            id="sv-note"
            data-testid="site-visit-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("Cancel", "Cancelar")}
          </Button>
          <Button type="submit" disabled={log.isPending} data-testid="site-visit-submit">
            {log.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// -----------------------------------------------------------------------------
// Client interaction
// -----------------------------------------------------------------------------
function ClientInteractionModal({
  projectId,
  actor,
  onClose,
}: {
  projectId: string;
  actor: string;
  onClose: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Backend channel enum: call | meeting | email | whatsapp.
  const [channel, setChannel] = useState<"call" | "meeting" | "email" | "whatsapp">("call");
  const [withWhom, setWithWhom] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    // Local-time ISO without seconds; the backend accepts any Date.parse-able string.
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");
  const log = useLogProjectClientInteraction();
  void actor;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withWhom.trim() || !occurredAt.trim()) return;
    try {
      await log.mutateAsync({
        projectId,
        data: {
          occurredAt: new Date(occurredAt).toISOString(),
          channel,
          with: withWhom.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pre-design`] });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: t("Interaction logged", "Interacción registrada"),
      });
      onClose();
    } catch {
      toast({ title: t("Could not log interaction", "No se pudo registrar"), variant: "destructive" });
    }
  };

  return (
    <ModalShell
      title={t("Log client contact", "Registrar contacto con cliente")}
      onClose={onClose}
      testId="client-interaction-modal"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="ci-channel" className="text-xs">
              {t("Channel", "Canal")}
            </Label>
            <select
              id="ci-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
              data-testid="client-interaction-channel"
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="call">{t("Call", "Llamada")}</option>
              <option value="meeting">{t("Meeting", "Reunión")}</option>
              <option value="email">{t("Email", "Correo")}</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ci-when" className="text-xs">
              {t("When", "Cuándo")} *
            </Label>
            <Input
              id="ci-when"
              type="datetime-local"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              data-testid="client-interaction-when"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="ci-with" className="text-xs">
            {t("With", "Con")} *
          </Label>
          <Input
            id="ci-with"
            required
            value={withWhom}
            onChange={(e) => setWithWhom(e.target.value)}
            placeholder={t("Client name or contact", "Nombre del cliente o contacto")}
            data-testid="client-interaction-with"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ci-note" className="text-xs">
            {t("Note (optional)", "Nota (opcional)")}
          </Label>
          <textarea
            id="ci-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="client-interaction-note"
            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("Cancel", "Cancelar")}
          </Button>
          <Button type="submit" disabled={log.isPending} data-testid="client-interaction-submit">
            {log.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// -----------------------------------------------------------------------------
// Asana task picker
// -----------------------------------------------------------------------------
function AsanaLinkModal({
  projectId,
  currentGid,
  onClose,
}: {
  projectId: string;
  currentGid: string | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const candidates = useListProjectAsanaCandidates(projectId, {
    query: { queryKey: [`/api/projects/${projectId}/asana-candidates`] },
  });
  const link = useLinkProjectToAsanaTask();
  const [manualGid, setManualGid] = useState<string>(currentGid ?? "");

  const submit = async (gid: string) => {
    if (!gid.trim()) return;
    try {
      await link.mutateAsync({ projectId, data: { asanaGid: gid.trim() } });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      await qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pre-design`] });
      toast({ title: t("Linked", "Vinculado") });
      onClose();
    } catch {
      toast({ title: t("Could not link", "No se pudo vincular"), variant: "destructive" });
    }
  };

  return (
    <ModalShell title={t("Link to Asana task", "Vincular tarea Asana")} onClose={onClose} testId="asana-link-modal">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t(
            "Pick a candidate from your board, or paste a task gid manually.",
            "Selecciona un candidato del tablero o pega el gid manualmente.",
          )}
        </p>

        <div className="border border-border rounded-md max-h-56 overflow-y-auto" data-testid="asana-candidates">
          {candidates.isLoading && (
            <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("Loading candidates…", "Cargando candidatos…")}
            </div>
          )}
          {!candidates.isLoading && (candidates.data?.candidates?.length ?? 0) === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {t("No matching tasks found.", "No se encontraron tareas coincidentes.")}
            </div>
          )}
          {(candidates.data?.candidates ?? []).map((c) => (
            <button
              key={c.gid}
              type="button"
              onClick={() => void submit(c.gid)}
              disabled={link.isPending}
              data-testid={`asana-candidate-${c.gid}`}
              className="w-full text-left px-3 py-2 text-sm border-b border-border last:border-0 hover:bg-muted flex items-center justify-between gap-2"
            >
              <span className="truncate">{c.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{c.gid}</span>
              {currentGid === c.gid && <CheckCircle2 className="w-3.5 h-3.5 text-konti-olive shrink-0" />}
            </button>
          ))}
        </div>

        <div>
          <Label htmlFor="asana-manual-gid" className="text-xs">
            {t("Or paste a task gid", "O pega el gid de una tarea")}
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="asana-manual-gid"
              value={manualGid}
              onChange={(e) => setManualGid(e.target.value)}
              placeholder="1209876543210"
              data-testid="asana-manual-gid"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => void submit(manualGid)}
              disabled={link.isPending || !manualGid.trim()}
              data-testid="asana-manual-link-submit"
            >
              {t("Link", "Vincular")}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
