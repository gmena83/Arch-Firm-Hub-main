import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";
import { ArrowRight, MapPin, Plus, X } from "lucide-react";

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [budgetAllocated, setBudgetAllocated] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createProject = useCreateProject({
    mutation: {
      onSuccess: async (project) => {
        await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({
          title: t("Project created", "Proyecto creado"),
          description: project.name,
        });
        onClose();
      },
      onError: (err: unknown) => {
        const fallback = t("Could not create project. Please try again.", "No se pudo crear el proyecto. Intenta de nuevo.");
        if (err instanceof ApiError) {
          const data = err.data as { fields?: Record<string, string>; message?: string; messageEs?: string } | undefined;
          if (data?.fields) {
            setFieldErrors(data.fields);
          }
          const localized = lang === "es" ? data?.messageEs ?? data?.message : data?.message;
          setSubmitError(localized ?? fallback);
          return;
        }
        setSubmitError(fallback);
      },
    },
  });

  function submit() {
    setFieldErrors({});
    setSubmitError(null);
    const errors: Record<string, string> = {};
    if (!name.trim()) errors["name"] = t("Required", "Requerido");
    if (!clientName.trim()) errors["clientName"] = t("Required", "Requerido");
    if (!location.trim()) errors["location"] = t("Required", "Requerido");
    const budgetNum = Number(budgetAllocated);
    if (!budgetAllocated || !isFinite(budgetNum) || budgetNum < 0) {
      errors["budgetAllocated"] = t("Must be a non-negative number", "Debe ser un número no negativo");
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    createProject.mutate({
      data: {
        name: name.trim(),
        clientName: clientName.trim(),
        location: location.trim(),
        budgetAllocated: budgetNum,
        description: description.trim() || undefined,
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="new-project-modal"
    >
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{t("New Project", "Nuevo Proyecto")}</h2>
          <button onClick={onClose} data-testid="btn-close-new-project" aria-label="close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
              {t("Project Name", "Nombre del Proyecto")}
            </label>
            <input
              data-testid="input-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
            {fieldErrors["name"] && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors["name"]}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
              {t("Client Name", "Nombre del Cliente")}
            </label>
            <input
              data-testid="input-client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
            {fieldErrors["clientName"] && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors["clientName"]}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
              {t("Location", "Ubicación")}
            </label>
            <input
              data-testid="input-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("Rincón, Puerto Rico", "Rincón, Puerto Rico")}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
            {fieldErrors["location"] && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors["location"]}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
              {t("Budget (USD)", "Presupuesto (USD)")}
            </label>
            <input
              data-testid="input-budget"
              type="number"
              min={0}
              value={budgetAllocated}
              onChange={(e) => setBudgetAllocated(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
            {fieldErrors["budgetAllocated"] && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors["budgetAllocated"]}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
              {t("Description (optional)", "Descripción (opcional)")}
            </label>
            <textarea
              data-testid="input-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          {submitError && (
            <p className="text-sm text-red-500" data-testid="text-submit-error">{submitError}</p>
          )}
          <button
            onClick={submit}
            disabled={createProject.isPending}
            data-testid="btn-submit-new-project"
            className="w-full mt-2 py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            {createProject.isPending
              ? t("Creating…", "Creando…")
              : t("Create Project", "Crear Proyecto")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { data: allProjects = [], isLoading } = useListProjects();
  const [showNew, setShowNew] = useState(false);

  const isClientUser = user?.role === "client";

  const projects = isClientUser
    ? allProjects.filter((p) => p.clientName.includes(user?.name ?? ""))
    : allProjects;

  const phaseColors: Record<string, string> = {
    discovery: "bg-sky-100 text-sky-800",
    consultation: "bg-konti-olive/15 text-konti-olive border border-konti-olive/30",
    pre_design: "bg-purple-100 text-purple-800",
    schematic_design: "bg-indigo-100 text-indigo-800",
    design_development: "bg-indigo-200 text-indigo-900",
    construction_documents: "bg-fuchsia-100 text-fuchsia-800",
    permits: "bg-amber-100 text-amber-800",
    construction: "bg-orange-100 text-orange-800",
    completed: "bg-emerald-100 text-emerald-800",
  };

  return (
    <RequireAuth>
      <AppLayout>
        <div className="space-y-6" data-testid="projects-page">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isClientUser ? t("My Project", "Mi Proyecto") : t("Projects", "Proyectos")}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {isClientUser
                  ? t("Your current project overview.", "Resumen de tu proyecto actual.")
                  : t("All active and completed projects.", "Todos los proyectos activos y completados.")}
              </p>
            </div>
            {!isClientUser && (
              <button
                onClick={() => setShowNew(true)}
                data-testid="btn-new-project"
                className="flex items-center gap-1.5 py-2 px-4 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors"
              >
                <Plus className="w-4 h-4" /> {t("New Project", "Nuevo Proyecto")}
              </button>
            )}
          </div>
          {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}

          {isLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-24 bg-card rounded-xl border animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => {
                const phaseLabel = lang === "es" ? project.phaseLabelEs : project.phaseLabel;
                const spendPct = Math.round((project.budgetUsed / project.budgetAllocated) * 100);
                // Task #134: role-derived cover image. Client → milestone
                // mockup; KONTi staff → latest construction-progress photo
                // (with `coverImage` as the universal fallback).
                const rowImage = isClientUser
                  ? (project.clientCoverImage ?? project.coverImage)
                  : (project.liveCoverImage ?? project.coverImage);
                // Surface the photo's upload date in the staff alt text
                // (matches dashboard ProjectCard). Only present when the
                // image was sourced from a real construction-progress doc.
                const liveDateLabel = !isClientUser && project.liveCoverUploadedAt
                  ? new Date(project.liveCoverUploadedAt).toLocaleDateString(
                      lang === "es" ? "es-PR" : "en-US",
                      { year: "numeric", month: "short", day: "numeric" },
                    )
                  : undefined;
                const rowImageAlt = isClientUser
                  ? t(
                      `${project.name} — milestone mockup at ${project.clientCoverLandmark ?? project.progressPercent}%`,
                      `${project.name} — maqueta de hito al ${project.clientCoverLandmark ?? project.progressPercent}%`,
                    )
                  : liveDateLabel
                    ? t(
                        `${project.name} — latest site photo (from ${liveDateLabel})`,
                        `${project.name} — última foto del sitio (del ${liveDateLabel})`,
                      )
                    : t(`${project.name} — latest site photo`, `${project.name} — última foto del sitio`);
                return (
                  <div
                    key={project.id}
                    data-testid={`row-project-${project.id}`}
                    className="bg-card rounded-xl border border-card-border shadow-sm p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow"
                  >
                    {rowImage && (
                      <img
                        src={resolveSeedImageUrl(rowImage)}
                        alt={rowImageAlt}
                        className="w-20 h-16 object-cover rounded-lg shrink-0 hidden sm:block"
                        data-testid={`img-project-row-cover-${project.id}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground">{project.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${phaseColors[project.phase]}`}>
                          {phaseLabel}
                        </span>
                        {isClientUser && typeof project.clientCoverLandmark === "number" && (
                          <span
                            data-testid={`pill-milestone-${project.id}`}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-konti-olive/10 text-konti-olive font-semibold"
                          >
                            {project.clientCoverLandmark}% {t("milestone", "hito")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {project.clientName} — {project.location}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{t("Progress", "Progreso")}</span>
                            <span className="font-medium">{project.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-konti-olive rounded-full" style={{ width: `${project.progressPercent}%` }} />
                          </div>
                        </div>
                        {!isClientUser && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                            ${project.budgetUsed.toLocaleString()} / ${project.budgetAllocated.toLocaleString()} ({spendPct}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      data-testid={`link-projects-list-${project.id}`}
                      className="shrink-0 flex items-center gap-1.5 py-2 px-3 sm:px-4 bg-konti-olive hover:bg-konti-olive/90 text-white text-xs font-semibold rounded-md transition-colors"
                    >
                      <span className="hidden sm:inline">{t("View", "Ver")}</span> <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
