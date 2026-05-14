import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Mail, Award, Plus, X, HardHat, UserCheck, Trash2, Loader2 } from "lucide-react";
import {
  useListContractors,
  useCreateContractors,
  useDeleteContractor,
  getListContractorsQueryKey,
  type Contractor,
  type ContractorCreateRequest,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireRole } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";

const TEAM = [
  {
    name: "Carla Gautier",
    title: "CEO & Founder",
    titleEs: "CEO y Fundadora",
    email: "carla@konti.com",
    specialty: "Sustainable Architecture & Project Vision",
    specialtyEs: "Arquitectura Sostenible y Visión de Proyectos",
    initials: "CG",
    color: "bg-konti-olive",
  },
  {
    name: "Michelle Telon Sosa",
    title: "Lead Designer",
    titleEs: "Diseñadora Principal",
    email: "michelle@konti.com",
    specialty: "Bioclimatic Design & Interior Architecture",
    specialtyEs: "Diseño Bioclimático y Arquitectura de Interiores",
    initials: "MT",
    color: "bg-konti-slate",
  },
  {
    name: "Jorge Rosa",
    title: "Chief Operations Officer",
    titleEs: "Director de Operaciones",
    email: "jorge@konti.com",
    specialty: "Construction Management & Site Logistics",
    specialtyEs: "Gestión de Construcción y Logística de Obra",
    initials: "JR",
    color: "bg-amber-700",
  },
  {
    name: "Nainoshka",
    title: "Environmental Construction Manager",
    titleEs: "Gerente de Construcción Ambiental",
    email: "nainoshka@konti.com",
    specialty: "Environmental Compliance & Permitting",
    specialtyEs: "Cumplimiento Ambiental y Permisos OGPE",
    initials: "N",
    color: "bg-teal-700",
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function ContractorUploadModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (rows: ContractorCreateRequest[]) => void;
  isSubmitting: boolean;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [bulkCsv, setBulkCsv] = useState("");
  const [mode, setMode] = useState<"single" | "csv">("single");

  const submitSingle = () => {
    if (!name.trim() || !trade.trim()) {
      toast({
        title: t("Name and trade are required", "Nombre y oficio son obligatorios"),
        variant: "destructive",
      });
      return;
    }
    onSubmit([
      {
        name: name.trim(),
        trade: trade.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
      },
    ]);
  };

  const submitCsv = () => {
    const lines = bulkCsv
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      toast({
        title: t("Paste at least one row", "Pega al menos una fila"),
        variant: "destructive",
      });
      return;
    }
    const hasHeader = /name|nombre/i.test(lines[0] ?? "") && /trade|oficio/i.test(lines[0] ?? "");
    const rows = hasHeader ? lines.slice(1) : lines;
    const accepted: ContractorCreateRequest[] = [];
    rows.forEach((row) => {
      const cells = row.split(",").map((c) => c.trim());
      const [n, tr, em, ph, no] = cells;
      if (!n || !tr) return;
      accepted.push({
        name: n,
        trade: tr,
        email: em ?? "",
        phone: ph ?? "",
        notes: no ?? "",
      });
    });
    if (accepted.length === 0) {
      toast({
        title: t("No valid rows found", "No se encontraron filas válidas"),
        description: t("Format: name, trade, email, phone, notes", "Formato: nombre, oficio, email, teléfono, notas"),
        variant: "destructive",
      });
      return;
    }
    onSubmit(accepted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="contractor-upload-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold flex items-center gap-2">
            <HardHat className="w-4 h-4 text-konti-olive" />
            {t("Add Contractor", "Agregar Contratista")}
          </h2>
          <button onClick={onClose} data-testid="btn-close-contractor"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2">
            {(["single", "csv"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                data-testid={`btn-contractor-mode-${m}`}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors ${
                  mode === m
                    ? "bg-konti-olive text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {m === "single" ? t("One contractor", "Un contratista") : t("Paste CSV", "Pegar CSV")}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-3 text-sm">
          {mode === "single" ? (
            <>
              <div>
                <label className="block text-xs font-medium mb-1">{t("Name", "Nombre")} *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-contractor-name"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t("Trade / specialty", "Oficio / especialidad")} *</label>
                <input
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  data-testid="input-contractor-trade"
                  placeholder={t("e.g. Electrician", "ej. Electricista")}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">{t("Email", "Correo")}</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-contractor-email"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{t("Phone", "Teléfono")}</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="input-contractor-phone"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t("Notes", "Notas")}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  data-testid="input-contractor-notes"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t(
                  "One contractor per line — columns: name, trade, email, phone, notes. A header row is optional.",
                  "Un contratista por línea — columnas: nombre, oficio, email, teléfono, notas. La fila de encabezado es opcional."
                )}
              </p>
              <textarea
                value={bulkCsv}
                onChange={(e) => setBulkCsv(e.target.value)}
                data-testid="input-contractor-csv"
                rows={6}
                placeholder={"Juan Pérez, Plumber, juan@vendor.pr, 787-555-0101, Insured\nMaría Soto, Mason, maria@vendor.pr, 787-555-0102, "}
                className="w-full font-mono text-xs px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="btn-cancel-contractor"
            className="px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-md disabled:opacity-50"
          >
            {t("Cancel", "Cancelar")}
          </button>
          <button
            onClick={mode === "single" ? submitSingle : submitCsv}
            disabled={isSubmitting}
            data-testid="btn-save-contractor"
            className="px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {mode === "single" ? t("Save", "Guardar") : t("Import", "Importar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);

  const { data: contractors = [], isLoading, isError } = useListContractors();

  const createMutation = useCreateContractors({
    mutation: {
      onSuccess: (res) => {
        qc.invalidateQueries({ queryKey: getListContractorsQueryKey() });
        const created = res?.created?.length ?? 0;
        const skipped = res?.skipped?.length ?? 0;
        toast({
          title:
            created === 1
              ? t("Contractor added", "Contratista agregado")
              : t(`Imported ${created} contractor(s)`, `Importado(s) ${created} contratista(s)`),
          description:
            skipped > 0
              ? t(`${skipped} row(s) were skipped.`, `${skipped} fila(s) omitida(s).`)
              : undefined,
        });
        setShowUpload(false);
      },
      onError: () => {
        toast({
          title: t("Could not save contractors", "No se pudieron guardar los contratistas"),
          variant: "destructive",
        });
      },
    },
  });

  const deleteMutation = useDeleteContractor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContractorsQueryKey() });
        toast({ title: t("Contractor removed", "Contratista eliminado") });
      },
      onError: () => {
        toast({
          title: t("Could not remove contractor", "No se pudo eliminar el contratista"),
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = (rows: ContractorCreateRequest[]) => {
    if (rows.length === 1) {
      createMutation.mutate({ data: rows[0]! });
    } else {
      createMutation.mutate({ data: { contractors: rows } });
    }
  };

  const handleRemove = (id: string) => {
    deleteMutation.mutate({ id });
  };

  return (
    <RequireRole roles={["admin", "superadmin", "architect"]}>
      <AppLayout>
        <div className="space-y-6" data-testid="team-page">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-konti-olive" />
              {t("Team Directory", "Directorio del Equipo")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("The KONTi Design | Build Studio team.", "El equipo de KONTi Design | Build Studio.")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEAM.map((member) => (
              <div
                key={member.email}
                data-testid={`team-card-${member.initials}`}
                className="bg-card rounded-xl border border-card-border shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full ${member.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                    {member.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-tight">{member.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                      {lang === "es" ? member.titleEs : member.title}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <a href={`mailto:${member.email}`} className="hover:text-foreground transition-colors truncate">
                      {member.email}
                    </a>
                  </div>
                  <div className="flex items-start gap-2">
                    <Award className="w-3.5 h-3.5 shrink-0 text-konti-olive mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-tight">
                      {lang === "es" ? member.specialtyEs : member.specialty}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3" data-testid="contractors-section">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <HardHat className="w-5 h-5 text-konti-olive" />
                {t("Contractors", "Contratistas")}
                <span className="text-xs font-normal text-muted-foreground">({contractors.length})</span>
              </h2>
              <button
                onClick={() => setShowUpload(true)}
                data-testid="btn-add-contractor"
                className="flex items-center gap-1.5 px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("Add Contractor", "Agregar Contratista")}
              </button>
            </div>

            {isLoading ? (
              <div className="bg-card border border-card-border rounded-xl p-8 text-center" data-testid="contractors-loading">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground/60" />
              </div>
            ) : isError ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center text-sm text-destructive" data-testid="contractors-error">
                {t("Could not load contractors.", "No se pudieron cargar los contratistas.")}
              </div>
            ) : contractors.length === 0 ? (
              <div className="bg-card border border-dashed border-card-border rounded-xl p-8 text-center">
                <HardHat className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t(
                    "No contractors yet — upload your vendor list to start tracking.",
                    "Aún no hay contratistas — sube tu lista de proveedores para empezar."
                  )}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {contractors.map((c: Contractor) => (
                  <div
                    key={c.id}
                    data-testid={`contractor-card-${c.id}`}
                    className="bg-card rounded-xl border border-card-border shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-konti-olive/15 text-konti-olive flex items-center justify-center text-xs font-bold shrink-0">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground text-sm leading-tight truncate">{c.name}</p>
                        <p className="text-xs text-konti-olive mt-0.5 leading-tight">{c.trade}</p>
                      </div>
                      <button
                        onClick={() => handleRemove(c.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`btn-remove-contractor-${c.id}`}
                        title={t("Remove", "Eliminar")}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {c.email && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          <a href={`mailto:${c.email}`} className="hover:text-foreground truncate">{c.email}</a>
                        </div>
                      )}
                      {c.phone && <div className="text-foreground/70">{c.phone}</div>}
                      {c.notes && <div className="text-muted-foreground italic line-clamp-2">{c.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showUpload && (
          <ContractorUploadModal
            onClose={() => setShowUpload(false)}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
          />
        )}
      </AppLayout>
    </RequireRole>
  );
}
