import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectPermits,
  useAuthorizePermits,
  useSignPermitForm,
  useRequestPermitSignature,
  useSubmitPermitsToOgpe,
  useSetPermitItemState,
  getGetProjectPermitsQueryKey,
  getGetProjectQueryKey,
  type PermitItem,
  type RequiredSignature,
  type PermitsResponseMilestones,
  PermitItemState,
  PermitItemPermitType,
  SetPermitItemStateBodyState,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  PenLine,
  Send,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileSignature,
  Building2,
  Loader2,
} from "lucide-react";

const STATE_BADGE: Record<PermitItemState, { bg: string; en: string; es: string }> = {
  not_submitted: { bg: "bg-slate-100 text-slate-700 border-slate-200", en: "Not submitted", es: "No sometido" },
  submitted: { bg: "bg-blue-100 text-blue-800 border-blue-200", en: "Submitted", es: "Sometido" },
  in_review: { bg: "bg-amber-100 text-amber-800 border-amber-200", en: "In review", es: "En revisión" },
  revision_requested: { bg: "bg-orange-100 text-orange-800 border-orange-200", en: "Revision requested", es: "Revisión solicitada" },
  approved: { bg: "bg-emerald-100 text-emerald-800 border-emerald-200", en: "Approved", es: "Aprobado" },
};

// Stable display order for the per-type sections inside the permit items
// list (Task #106). Anything that arrives without a `permitType` (e.g. an
// older/legacy seed item) is bucketed under "other" at render time so it
// never disappears from the list.
const PERMIT_TYPE_ORDER: PermitItemPermitType[] = [
  PermitItemPermitType.structural,
  PermitItemPermitType.electrical,
  PermitItemPermitType.plumbing,
  PermitItemPermitType.mechanical,
  PermitItemPermitType.environmental,
  PermitItemPermitType.use,
  PermitItemPermitType.other,
];

const PERMIT_TYPE_LABEL: Record<PermitItemPermitType, { en: string; es: string }> = {
  structural: { en: "Structural", es: "Estructural" },
  electrical: { en: "Electrical", es: "Eléctrico" },
  plumbing: { en: "Plumbing", es: "Plomería" },
  mechanical: { en: "Mechanical", es: "Mecánico" },
  environmental: { en: "Environmental", es: "Ambiental" },
  use: { en: "Use & Occupancy", es: "Uso y Ocupación" },
  other: { en: "Other", es: "Otros" },
};

// Status order matching the existing badge ordering, used to keep items
// inside each per-type section in a predictable, status-grouped sequence.
const STATE_DISPLAY_ORDER: PermitItemState[] = [
  PermitItemState.revision_requested,
  PermitItemState.in_review,
  PermitItemState.submitted,
  PermitItemState.not_submitted,
  PermitItemState.approved,
];

const ITEM_STATE_VALUES = Object.values(SetPermitItemStateBodyState);
const parseItemState = (value: string): SetPermitItemStateBodyState | null =>
  (ITEM_STATE_VALUES as readonly string[]).includes(value)
    ? (value as SetPermitItemStateBodyState)
    : null;

const MILESTONES: Array<{ key: keyof PermitsResponseMilestones; en: string; es: string }> = [
  { key: "authorization", en: "Authorization", es: "Autorización" },
  { key: "signatures", en: "Signatures", es: "Firmas" },
  { key: "submission", en: "Submission", es: "Sometimiento" },
  { key: "review", en: "Review", es: "Revisión" },
  { key: "approval", en: "Approval", es: "Aprobación" },
];

interface Props {
  projectId: string;
  projectPhase: string;
  onProjectUpdated?: () => void;
}

export default function PermitsPanel({ projectId, projectPhase, onProjectUpdated }: Props) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetProjectPermits(projectId);
  const authorizeMutation = useAuthorizePermits();
  const signMutation = useSignPermitForm();
  const requestSigMutation = useRequestPermitSignature();
  const submitMutation = useSubmitPermitsToOgpe();
  const itemStateMutation = useSetPermitItemState();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<Record<string, string>>({});
  const [revNote, setRevNote] = useState<Record<string, string>>({});
  const [signDialogFor, setSignDialogFor] = useState<RequiredSignature | null>(null);

  const isClient = user?.role === "client";
  const isStaff = !!user?.role && (["admin", "superadmin", "architect"] as const).includes(user.role as "admin" | "superadmin" | "architect");
  const inPermitsPhase = projectPhase === "permits";
  const isAuthorized = data?.authorization.status === "authorized";

  const invalidatePermits = () =>
    queryClient.invalidateQueries({ queryKey: getGetProjectPermitsQueryKey(projectId) });

  const authorize = async () => {
    setBusyId("__auth__");
    try {
      await authorizeMutation.mutateAsync({ id: projectId });
      toast({ title: t("Authorization recorded", "Autorización registrada") });
      await invalidatePermits();
    } catch {
      toast({ title: t("Authorization failed", "Falló la autorización"), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const sign = async (sigId: string) => {
    const name = (signatureDraft[sigId] ?? "").trim();
    if (name.length < 2) {
      toast({ title: t("Type your full name to sign", "Escribe tu nombre para firmar"), variant: "destructive" });
      return;
    }
    setBusyId(`sig-${sigId}`);
    try {
      const res = (await signMutation.mutateAsync({ id: projectId, signatureId: sigId, data: { signatureName: name } })) as { emailWarning?: string };
      toast({ title: t("Signature recorded", "Firma registrada") });
      if (res?.emailWarning) {
        toast({
          title: t("Team notification email failed", "El correo de notificación al equipo no se envió"),
          description: res.emailWarning,
          variant: "destructive",
        });
      }
      setSignatureDraft((d) => ({ ...d, [sigId]: "" }));
      await invalidatePermits();
    } catch {
      toast({ title: t("Could not sign", "No se pudo firmar"), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  // Task #102 — staff resend / initial signature request via mailer.
  const requestSignature = async (sigId: string) => {
    setBusyId(`req-${sigId}`);
    try {
      const res = await requestSigMutation.mutateAsync({ id: projectId, signatureId: sigId });
      if (res.deduped) {
        toast({ title: t("Request already pending — no email sent", "Solicitud ya pendiente — no se envió correo") });
      } else if (res.emailSent) {
        toast({ title: t("Signature request emailed to client", "Solicitud de firma enviada al cliente") });
      } else {
        toast({
          title: t("Email could not be sent", "No se pudo enviar el correo"),
          description: res.reason ?? "",
          variant: "destructive",
        });
      }
      await invalidatePermits();
    } catch {
      toast({ title: t("Request failed", "Falló la solicitud"), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const submitToOgpe = async () => {
    setBusyId("__submit__");
    try {
      await submitMutation.mutateAsync({ id: projectId });
      toast({ title: t("Submitted to OGPE", "Enviado a OGPE") });
      await invalidatePermits();
    } catch {
      toast({ title: t("Submission failed", "Falló el envío"), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const setItemState = async (itemId: string, nextState: SetPermitItemStateBodyState) => {
    setBusyId(`item-${itemId}`);
    try {
      const note = revNote[itemId] ?? "";
      const body: { state: SetPermitItemStateBodyState; revisionNote?: string; revisionNoteEs?: string } = { state: nextState };
      if (nextState === SetPermitItemStateBodyState.revision_requested && note.trim()) {
        body.revisionNote = note.trim();
        body.revisionNoteEs = note.trim();
      }
      const res = await itemStateMutation.mutateAsync({ id: projectId, itemId, data: body });
      toast({ title: t("Permit updated", "Permiso actualizado") });
      if (res.advancedToConstruction) {
        toast({ title: t("Project advanced to Construction", "Proyecto avanzado a Construcción") });
        await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        onProjectUpdated?.();
      }
      setRevNote((r) => ({ ...r, [itemId]: "" }));
      await invalidatePermits();
    } catch {
      toast({ title: t("Update failed", "Falló la actualización"), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  if (isLoading && !data) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("Loading permits…", "Cargando permisos…")}
      </div>
    );
  }
  if (!data) return null;

  const { authorization, requiredSignatures, permitItems, milestones, canSubmitToOgpe } = data;

  // Closure helper that renders a single permit item card. Extracted so the
  // per-type grouping section below can call into it for each item without
  // duplicating the markup. Captures `lang`, `t`, `isStaff`, `busyId`, and
  // the mutation handlers from the surrounding component scope.
  const renderPermitItem = (it: PermitItem) => {
    const badge = STATE_BADGE[it.state];
    return (
      <div
        key={it.id}
        data-testid={`permit-item-${it.id}`}
        className="border border-slate-200 rounded-lg p-3 bg-white"
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium text-sm text-slate-900">{lang === "es" ? it.nameEs : it.name}</div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${badge.bg}`}>
                {lang === "es" ? badge.es : badge.en}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {it.agency} · {it.responsible} · {lang === "es" ? it.estimatedTimeEs : it.estimatedTime}
            </div>
            <div className="text-xs text-slate-600 mt-1">{lang === "es" ? it.notesEs : it.notes}</div>
            {it.state === "revision_requested" && (it.revisionNote || it.revisionNoteEs) && (
              <div className="mt-2 text-xs px-2 py-1.5 rounded bg-orange-50 border border-orange-200 text-orange-800">
                <strong>{t("Revision note: ", "Nota de revisión: ")}</strong>
                {lang === "es" ? (it.revisionNoteEs ?? it.revisionNote) : (it.revisionNote ?? it.revisionNoteEs)}
              </div>
            )}
            {it.lastUpdatedAt && (
              <div className="text-[11px] text-slate-400 mt-1">
                {t("Updated", "Actualizado")}: {new Date(it.lastUpdatedAt).toLocaleString()}
              </div>
            )}
          </div>
          {isStaff && (
            <div className="flex flex-col gap-1.5 items-stretch sm:items-end w-full sm:w-auto">
              <select
                value={it.state}
                onChange={(e) => {
                  const next = parseItemState(e.target.value);
                  if (next) void setItemState(it.id, next);
                }}
                disabled={busyId === `item-${it.id}`}
                className="text-xs px-2 py-1 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-emerald-500 w-full sm:w-auto"
                aria-label={t("Change state", "Cambiar estado")}
              >
                <option value={SetPermitItemStateBodyState.not_submitted}>{lang === "es" ? "No sometido" : "Not submitted"}</option>
                <option value={SetPermitItemStateBodyState.submitted}>{lang === "es" ? "Sometido" : "Submitted"}</option>
                <option value={SetPermitItemStateBodyState.in_review}>{lang === "es" ? "En revisión" : "In review"}</option>
                <option value={SetPermitItemStateBodyState.revision_requested}>{lang === "es" ? "Revisión solicitada" : "Revision requested"}</option>
                <option value={SetPermitItemStateBodyState.approved}>{lang === "es" ? "Aprobado" : "Approved"}</option>
              </select>
              <input
                type="text"
                placeholder={t("Revision note (optional)", "Nota de revisión (opcional)")}
                value={revNote[it.id] ?? ""}
                onChange={(e) => setRevNote((r) => ({ ...r, [it.id]: e.target.value }))}
                className="text-xs px-2 py-1 border border-slate-300 rounded-md w-full sm:w-48"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-emerald-700" />
        <h2 className="text-lg font-semibold text-slate-900">{t("Phase 4 — Permits", "Fase 4 — Permisos")}</h2>
        {!inPermitsPhase && (
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {t("Read-only — project not in permits phase", "Solo lectura — proyecto fuera de la fase de permisos")}
          </span>
        )}
      </div>

      {/* Milestones */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {MILESTONES.map((m, i) => {
            const done = milestones[m.key];
            return (
              <div key={m.key} className="flex items-center gap-2 flex-1 min-w-[140px]">
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                )}
                <div className="text-sm">
                  <div className="text-xs text-slate-500">{`${i + 1}.`}</div>
                  <div className={done ? "font-semibold text-slate-900" : "text-slate-600"}>
                    {lang === "es" ? m.es : m.en}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Authorization */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <ShieldCheck className={`w-5 h-5 mt-0.5 ${authorization.status === "authorized" ? "text-emerald-600" : "text-slate-400"}`} />
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">
              {t("Client Authorization for OGPE Submission", "Autorización del cliente para sometimiento a OGPE")}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {t(
                "By authorizing, you confirm the design is final and authorize KONTi to submit the OGPE permit packet on your behalf. The packet includes:",
                "Al autorizar, confirmas que el diseño es final y autorizas a KONTi a someter el paquete de permisos a OGPE en tu nombre. El paquete incluye:",
              )}
            </p>
            <ul className="text-xs text-slate-600 mt-1.5 ml-5 list-disc space-y-0.5">
              <li>{t("Stamped construction plans and structural drawings", "Planos de construcción sellados y dibujos estructurales")}</li>
              <li>{t("MEP drawings (electrical, plumbing, mechanical)", "Dibujos MEP (eléctrico, plomería, mecánico)")}</li>
              <li>{t("Signed Owner's Affidavit, ARPE & OGPE applications, PE stamp authorization", "Affidavit del Dueño, solicitudes ARPE y OGPE, autorización de sello PE — firmados")}</li>
              <li>{t("Site survey, zoning analysis, and project specifications", "Levantamiento del sitio, análisis de zonificación y especificaciones del proyecto")}</li>
            </ul>
            {authorization.status === "authorized" ? (
              <div className="mt-2 space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  {t("Authorized by", "Autorizado por")} {authorization.authorizedBy}
                  {authorization.authorizedAt && ` · ${new Date(authorization.authorizedAt).toLocaleString()}`}
                </div>
                {authorization.authorizedIpMock && (
                  <div className="text-[11px] text-slate-500 font-mono">
                    {t("IP", "IP")}: {authorization.authorizedIpMock}
                  </div>
                )}
              </div>
            ) : isClient && inPermitsPhase ? (
              <button
                onClick={authorize}
                disabled={busyId === "__auth__"}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyId === "__auth__" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {t("Authorize OGPE submission", "Autorizar sometimiento a OGPE")}
              </button>
            ) : (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3 h-3" />
                {t("Awaiting client authorization", "Esperando autorización del cliente")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Required signatures */}
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <FileSignature className="w-4 h-4" /> {t("Required Signatures", "Firmas Requeridas")}
        </h3>
        {!isAuthorized && (
          <div className="mb-3 px-3 py-2 text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />
            {t("Authorize the OGPE submission packet above before signing forms.", "Autoriza el paquete de sometimiento OGPE antes de firmar los formularios.")}
          </div>
        )}
        <div className="space-y-2">
          {requiredSignatures.map((sig) => {
            const signed = !!sig.signedAt;
            return (
              <div key={sig.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                {signed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-900">{lang === "es" ? sig.formNameEs : sig.formName}</div>
                  {signed ? (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t("Signed by", "Firmado por")} {sig.signedBy}
                      {sig.signedAt && ` · ${new Date(sig.signedAt).toLocaleDateString()}`}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isClient && inPermitsPhase && isAuthorized && (
                        <button
                          onClick={() => setSignDialogFor(sig)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <PenLine className="w-3 h-3" />
                          {t("Sign", "Firmar")}
                        </button>
                      )}
                      {isStaff && inPermitsPhase && isAuthorized && (
                        <button
                          onClick={() => requestSignature(sig.id)}
                          disabled={busyId === `req-${sig.id}`}
                          data-testid={`request-signature-${sig.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {busyId === `req-${sig.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {t("Request signature", "Solicitar firma")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Permit items — grouped by permit type, then by status inside each
          type (Task #106). The previous flat list mixed all permit families
          together; clients/team couldn't see "where are we on Structural
          vs Electrical?" at a glance. */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">{t("Permit Items", "Permisos")}</h3>
          {isStaff && canSubmitToOgpe && (
            <button
              onClick={submitToOgpe}
              disabled={busyId === "__submit__"}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busyId === "__submit__" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("Submit packet to OGPE", "Enviar paquete a OGPE")}
            </button>
          )}
        </div>
        {(() => {
          // Bucket items by permitType, defaulting to "other" so newly added
          // permits without an explicit type still surface in the UI.
          const byType: Record<PermitItemPermitType, PermitItem[]> = {
            structural: [], electrical: [], plumbing: [], mechanical: [],
            environmental: [], use: [], other: [],
          };
          for (const it of permitItems) {
            // Defensive: treat both `undefined` *and* unrecognized strings as
            // "other" so a future enum value or malformed payload can't make
            // an item silently disappear from the UI.
            const raw = it.permitType;
            const key: PermitItemPermitType =
              raw && raw in byType ? (raw as PermitItemPermitType) : PermitItemPermitType.other;
            byType[key].push(it);
          }
          const presentTypes = PERMIT_TYPE_ORDER.filter((tp) => byType[tp].length > 0);
          if (presentTypes.length === 0) {
            return (
              <div className="text-sm text-slate-500 italic">
                {t("No permit items for this project yet.", "Aún no hay permisos para este proyecto.")}
              </div>
            );
          }
          return (
            <div className="space-y-5">
              {presentTypes.map((tp) => {
                const list = byType[tp];
                const approvedCount = list.filter((i) => i.state === "approved").length;
                const totalCount = list.length;
                const allApproved = approvedCount === totalCount;
                const label = PERMIT_TYPE_LABEL[tp];
                // Sort items inside the section by status priority so
                // revision_requested / in_review float to the top.
                const sortedList = [...list].sort(
                  (a, b) =>
                    STATE_DISPLAY_ORDER.indexOf(a.state) - STATE_DISPLAY_ORDER.indexOf(b.state),
                );
                return (
                  <section
                    key={tp}
                    data-testid={`permit-type-section-${tp}`}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <header
                      data-testid={`permit-type-header-${tp}`}
                      className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="text-sm font-semibold text-slate-800">
                        {lang === "es" ? label.es : label.en}
                      </div>
                      <span
                        data-testid={`permit-type-chip-${tp}`}
                        className={
                          "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border " +
                          (allApproved
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-700 border-slate-200")
                        }
                        aria-label={t(
                          `${approvedCount} of ${totalCount} approved`,
                          `${approvedCount} de ${totalCount} aprobados`,
                        )}
                      >
                        {t(
                          `${approvedCount} of ${totalCount} approved`,
                          `${approvedCount} de ${totalCount} aprobados`,
                        )}
                      </span>
                    </header>
                    <div className="p-2 space-y-2">
                      {sortedList.map((it) => renderPermitItem(it))}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()}
      </div>

      {signDialogFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSignDialogFor(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-emerald-700" />
              {t("Sign Form", "Firmar Formulario")}
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              <strong>{lang === "es" ? signDialogFor.formNameEs : signDialogFor.formName}</strong>
            </p>
            <p className="text-xs text-slate-600 mt-2">
              {t(
                "By typing your full legal name below, you electronically sign this form and agree it has the same legal effect as a handwritten signature.",
                "Al escribir tu nombre legal completo abajo, firmas electrónicamente este formulario y aceptas que tiene el mismo efecto legal que una firma manuscrita.",
              )}
            </p>
            <input
              type="text"
              autoFocus
              placeholder={t("Type your full legal name", "Escribe tu nombre legal completo")}
              value={signatureDraft[signDialogFor.id] ?? ""}
              onChange={(e) => setSignatureDraft((d) => ({ ...d, [signDialogFor.id]: e.target.value }))}
              className="mt-3 w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSignDialogFor(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t("Cancel", "Cancelar")}
              </button>
              <button
                onClick={async () => {
                  const id = signDialogFor.id;
                  await sign(id);
                  setSignDialogFor(null);
                }}
                disabled={busyId === `sig-${signDialogFor.id}` || (signatureDraft[signDialogFor.id] ?? "").trim().length < 2}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {busyId === `sig-${signDialogFor.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <PenLine className="w-3 h-3" />}
                {t("Sign", "Firmar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
