import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProjectMetadata,
  getGetProjectQueryKey,
  type Project,
} from "@workspace/api-client-react";
import { Ruler, ExternalLink } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";

const PROJECT_TYPE_OPTIONS: Array<{ value: Project["projectType"]; labelEn: string; labelEs: string }> = [
  { value: "residencial", labelEn: "Residential", labelEs: "Residencial" },
  { value: "comercial", labelEn: "Commercial", labelEs: "Comercial" },
  { value: "mixto", labelEn: "Mixed-use", labelEs: "Mixto" },
  { value: "contenedor", labelEn: "Container", labelEs: "Contenedor" },
];

function projectTypeLabel(value: Project["projectType"] | undefined, lang: "en" | "es"): string {
  if (!value) return "—";
  const opt = PROJECT_TYPE_OPTIONS.find((o) => o.value === value);
  if (!opt) return value;
  return lang === "es" ? opt.labelEs : opt.labelEn;
}

export interface ProjectMetadata {
  squareMeters: number;
  bathrooms: number;
  kitchens: number;
  projectType: Project["projectType"];
  contingencyPercent: number;
}

/**
 * B-05: Project metadata (square meters / bathrooms / kitchens / project type /
 * contingency %) lives on the Project record and is edited from Project Detail.
 *
 * - `variant="editable"` (Project Detail): inline edit form, persists via
 *   PATCH /projects/:id/metadata.
 * - `variant="readonly"` (Contractor Calculator): summary view with a link
 *   back to Project Detail so values are only edited from one place.
 */
export function ProjectMetadataCard({
  projectId,
  variant,
  squareMeters,
  bathrooms,
  kitchens,
  projectType,
  contingencyPercent,
}: {
  projectId: string;
  variant: "editable" | "readonly";
  squareMeters?: number;
  bathrooms?: number;
  kitchens?: number;
  projectType?: Project["projectType"];
  contingencyPercent?: number;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [sqm, setSqm] = useState<string>(squareMeters !== undefined ? String(squareMeters) : "");
  const [bath, setBath] = useState<string>(bathrooms !== undefined ? String(bathrooms) : "");
  const [kit, setKit] = useState<string>(kitchens !== undefined ? String(kitchens) : "");
  const [pt, setPt] = useState<Project["projectType"]>(projectType ?? "residencial");
  const [cont, setCont] = useState<string>(contingencyPercent !== undefined ? String(contingencyPercent) : "");

  useEffect(() => { setSqm(squareMeters !== undefined ? String(squareMeters) : ""); }, [squareMeters]);
  useEffect(() => { setBath(bathrooms !== undefined ? String(bathrooms) : ""); }, [bathrooms]);
  useEffect(() => { setKit(kitchens !== undefined ? String(kitchens) : ""); }, [kitchens]);
  useEffect(() => { setPt(projectType ?? "residencial"); }, [projectType]);
  useEffect(() => { setCont(contingencyPercent !== undefined ? String(contingencyPercent) : ""); }, [contingencyPercent]);

  const mutation = useUpdateProjectMetadata({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        toast({
          title: t("Saved", "Guardado"),
          description: t("Project metadata updated.", "Metadatos del proyecto actualizados."),
        });
        setEditing(false);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: t("Save failed", "Error al guardar"),
          description: t("Could not update project metadata.", "No se pudieron actualizar los metadatos."),
        });
      },
    },
  });

  const onSave = () => {
    const sqmNum = Number(sqm);
    const bathNum = Math.max(0, Math.floor(Number(bath) || 0));
    const kitNum = Math.max(0, Math.floor(Number(kit) || 0));
    const contNum = Number(cont);
    if (!isFinite(sqmNum) || sqmNum <= 0) {
      toast({
        variant: "destructive",
        title: t("Invalid square meters", "Metros cuadrados inválidos"),
        description: t("Square meters must be greater than 0.", "Los metros cuadrados deben ser mayores que 0."),
      });
      return;
    }
    if (!isFinite(contNum) || contNum < 0 || contNum > 50) {
      toast({
        variant: "destructive",
        title: t("Invalid contingency", "Contingencia inválida"),
        description: t("Contingency must be between 0 and 50.", "La contingencia debe estar entre 0 y 50."),
      });
      return;
    }
    mutation.mutate({
      projectId,
      data: {
        squareMeters: sqmNum,
        bathrooms: bathNum,
        kitchens: kitNum,
        projectType: pt,
        contingencyPercent: contNum,
      },
    });
  };

  const onCancel = () => {
    setSqm(squareMeters !== undefined ? String(squareMeters) : "");
    setBath(bathrooms !== undefined ? String(bathrooms) : "");
    setKit(kitchens !== undefined ? String(kitchens) : "");
    setPt(projectType ?? "residencial");
    setCont(contingencyPercent !== undefined ? String(contingencyPercent) : "");
    setEditing(false);
  };

  const summary = (
    <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="project-metadata-summary">
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Square meters", "Metros cuadrados")}</dt>
        <dd className="text-foreground font-semibold" data-testid="project-metadata-sqm">
          {squareMeters && squareMeters > 0 ? `${squareMeters.toLocaleString()} m²` : t("—", "—")}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Project type", "Tipo de proyecto")}</dt>
        <dd className="text-foreground font-semibold" data-testid="project-metadata-type">
          {projectTypeLabel(projectType, lang)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Bathrooms", "Baños")}</dt>
        <dd className="text-foreground font-semibold" data-testid="project-metadata-bathrooms">
          {bathrooms ?? 0}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Kitchens", "Cocinas")}</dt>
        <dd className="text-foreground font-semibold" data-testid="project-metadata-kitchens">
          {kitchens ?? 0}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("Contingency %", "Contingencia %")}</dt>
        <dd className="text-foreground font-semibold" data-testid="project-metadata-contingency">
          {contingencyPercent ?? 0}%
        </dd>
      </div>
    </dl>
  );

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="project-metadata-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-foreground flex items-center gap-1.5">
          <Ruler className="w-4 h-4" /> {t("Project Metadata", "Metadatos del Proyecto")}
        </h2>
        {variant === "editable" && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1 rounded-md border border-input hover:bg-muted text-muted-foreground"
            data-testid="project-metadata-edit"
          >
            {t("Edit", "Editar")}
          </button>
        )}
        {variant === "readonly" && (
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-md border border-input hover:bg-muted text-muted-foreground"
            data-testid="project-metadata-edit-link"
          >
            {t("Edit on Project Detail", "Editar en Detalle del Proyecto")} <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {t(
          "Project size, bathrooms, kitchens, project type, and contingency feed every estimate. Edited once here, used everywhere.",
          "El tamaño del proyecto, baños, cocinas, tipo de proyecto y contingencia alimentan cada estimado. Se editan aquí una vez y se usan en todas partes.",
        )}
      </p>
      {variant === "readonly" || !editing ? (
        summary
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs font-medium space-y-1 block">
            {t("Square meters", "Metros cuadrados")}
            <input
              type="number"
              min={1}
              value={sqm}
              onChange={(e) => setSqm(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="project-metadata-sqm-input"
            />
          </label>
          <label className="text-xs font-medium space-y-1 block">
            {t("Project type", "Tipo de proyecto")}
            <select
              value={pt}
              onChange={(e) => setPt(e.target.value as Project["projectType"])}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="project-metadata-type-input"
            >
              {PROJECT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{lang === "es" ? o.labelEs : o.labelEn}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium space-y-1 block">
            {t("Bathrooms", "Baños")}
            <input
              type="number"
              min={0}
              step={1}
              value={bath}
              onChange={(e) => setBath(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="project-metadata-bathrooms-input"
            />
          </label>
          <label className="text-xs font-medium space-y-1 block">
            {t("Kitchens", "Cocinas")}
            <input
              type="number"
              min={0}
              step={1}
              value={kit}
              onChange={(e) => setKit(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="project-metadata-kitchens-input"
            />
          </label>
          <label className="text-xs font-medium space-y-1 block md:col-span-2">
            {t("Contingency %", "Contingencia %")}
            <input
              type="number"
              min={0}
              max={50}
              step="0.1"
              value={cont}
              onChange={(e) => setCont(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
              data-testid="project-metadata-contingency-input"
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="button"
              onClick={onSave}
              disabled={mutation.isPending}
              className="px-3 py-1.5 rounded-md bg-konti-olive text-white text-sm hover:bg-konti-olive/90 disabled:opacity-50"
              data-testid="project-metadata-save"
            >
              {mutation.isPending ? t("Saving…", "Guardando…") : t("Save", "Guardar")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={mutation.isPending}
              className="px-3 py-1.5 rounded-md border border-input text-sm hover:bg-muted"
              data-testid="project-metadata-cancel"
            >
              {t("Cancel", "Cancelar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectMetadataCard;
