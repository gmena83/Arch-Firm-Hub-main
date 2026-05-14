import { Link } from "wouter";
import {
  useListProjects, useGetDashboardSummary, useGetRecentActivity,
  useGetProjectTasks, useGetProjectDocuments,
  getGetProjectTasksQueryKey, getGetProjectDocumentsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { WeatherBadge } from "@/components/weather-badge";
import { useGetProjectWeather } from "@workspace/api-client-react";
import { ArrowRight, TrendingUp, FolderOpen, FileText, Clock, Activity, BarChart3, CheckCircle, Receipt } from "lucide-react";
import { ConstructionStatusCard } from "@/components/construction-status-card";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";
import { formatDistanceToNow } from "date-fns";
import { es as dateEs } from "date-fns/locale";

function ProjectCard({ project, isClientUser }: {
  project: { id: string; name: string; clientName: string; location: string; phase: string; phaseLabel: string; phaseLabelEs: string; phaseNumber: number; progressPercent: number; budgetAllocated: number; budgetUsed: number; coverImage?: string; liveCoverImage?: string; liveCoverUploadedAt?: string; clientCoverImage?: string; clientCoverLandmark?: number; status: string };
  isClientUser: boolean;
}) {
  const { t, lang } = useLang();
  const { data: weather } = useGetProjectWeather(project.id);

  // Task #134: prefer the role-derived cover the API enriched onto the
  // project (`liveCoverImage` for KONTi staff = latest construction-progress
  // photo; `clientCoverImage` for clients = milestone mockup). Fall back to
  // the static `coverImage` if a freshly-created project hasn't been
  // enriched yet (or for older cached payloads).
  const cardImage = isClientUser
    ? (project.clientCoverImage ?? project.coverImage)
    : (project.liveCoverImage ?? project.coverImage);
  // Staff alt text reads "from {date}" when the live image is sourced
  // from a real construction-progress photo (the API only sets
  // `liveCoverUploadedAt` in that case — a coverImage fallback omits it).
  const liveDateLabel = !isClientUser && project.liveCoverUploadedAt
    ? new Date(project.liveCoverUploadedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      })
    : undefined;
  const cardImageAlt = isClientUser
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

  const spendPct = Math.round((project.budgetUsed / project.budgetAllocated) * 100);
  const phaseLabel = lang === "es" ? project.phaseLabelEs : project.phaseLabel;
  const budgetColor = spendPct > 90 ? "bg-red-500" : spendPct > 70 ? "bg-amber-500" : "bg-konti-olive";

  return (
    <div
      data-testid={`card-project-${project.id}`}
      className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
    >
      {cardImage && (
        <div className="relative h-44 overflow-hidden">
          <img
            src={resolveSeedImageUrl(cardImage)}
            alt={cardImageAlt}
            className="w-full h-full object-cover"
            data-testid={`img-project-cover-${project.id}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-konti-dark/80 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="font-bold text-white text-lg leading-tight">{project.name}</h3>
            <p className="text-white/70 text-xs">{project.clientName} — {project.location}</p>
          </div>
          <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-0.5 rounded-full ${phaseColors[project.phase] ?? "bg-gray-100 text-gray-800"}`}>
            {phaseLabel}
          </span>
          {isClientUser && typeof project.clientCoverLandmark === "number" && (
            <span
              className="absolute top-3 left-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/85 text-konti-dark backdrop-blur-sm"
              data-testid={`pill-milestone-${project.id}`}
            >
              {project.clientCoverLandmark}% {t("milestone", "hito")}
            </span>
          )}
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground font-medium">{t("Overall Progress", "Progreso General")}</span>
            <span className="font-bold text-foreground">{project.progressPercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-konti-olive rounded-full" style={{ width: `${project.progressPercent}%` }} />
          </div>
        </div>

        {/* Budget — hide exact amounts for client users */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground font-medium">{t("Budget Used", "Presupuesto Usado")}</span>
            <span className="font-bold text-foreground">{spendPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${budgetColor}`} style={{ width: `${Math.min(spendPct, 100)}%` }} />
          </div>
          {!isClientUser && (
            <p className="text-xs text-muted-foreground mt-1">
              ${project.budgetUsed.toLocaleString()} / ${project.budgetAllocated.toLocaleString()}
            </p>
          )}
        </div>

        {/* Weather */}
        {weather && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{weather.city}</span>
            <WeatherBadge
              buildSuitability={weather.buildSuitability as "green" | "yellow" | "red"}
              buildSuitabilityLabel={weather.buildSuitabilityLabel}
              buildSuitabilityLabelEs={weather.buildSuitabilityLabelEs}
              temperature={weather.temperature}
              temperatureUnit={weather.temperatureUnit}
              compact
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Link
            href={`/projects/${project.id}`}
            data-testid={`link-project-detail-${project.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-konti-olive hover:bg-konti-olive/90 text-white text-xs font-semibold rounded-md transition-colors"
          >
            {t("View Project", "Ver Proyecto")} <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            href={`/projects/${project.id}/report`}
            data-testid={`link-project-report-${project.id}`}
            className="flex items-center justify-center gap-1.5 py-2 px-3 border border-border text-xs font-semibold rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            {t("Report", "Reporte")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    document_upload: <FileText className="w-4 h-4" />,
    task_completed: <CheckCircle className="w-4 h-4" />,
    phase_change: <TrendingUp className="w-4 h-4" />,
    weather_alert: <Activity className="w-4 h-4" />,
    comment: <Activity className="w-4 h-4" />,
  };
  return <>{icons[type] ?? <Activity className="w-4 h-4" />}</>;
}

function DashboardContent() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { data: allProjects = [], isLoading: projectsLoading } = useListProjects();
  const { data: summary } = useGetDashboardSummary();
  const { data: allActivity = [] } = useGetRecentActivity();

  const isClientUser = user?.role === "client";

  const projects = isClientUser
    ? allProjects.filter((p) => p.clientName.includes(user?.name ?? ""))
    : allProjects;

  const clientProjectId = isClientUser ? (projects[0]?.id ?? "") : "";

  const { data: clientTasks = [] } = useGetProjectTasks(clientProjectId, {
    query: { enabled: isClientUser && !!clientProjectId, queryKey: getGetProjectTasksQueryKey(clientProjectId) }
  });
  const { data: clientDocs = [] } = useGetProjectDocuments(clientProjectId, undefined, {
    query: { enabled: isClientUser && !!clientProjectId, queryKey: getGetProjectDocumentsQueryKey(clientProjectId, undefined) }
  });

  const activity = isClientUser
    ? allActivity.filter((a) => projects.some((p) => p.name === a.projectName))
    : allActivity;

  const greeting = isClientUser
    ? t(`Welcome to your project portal, ${user?.name?.split(" ")[0]}`, `Bienvenido a tu portal de proyecto, ${user?.name?.split(" ")[0]}`)
    : `${t("Good morning", "Buenos días")}, ${user?.name?.split(" ")[0]}`;

  const subtitle = isClientUser
    ? t("Here's the latest update on your project.", "Aquí tienes la actualización más reciente de tu proyecto.")
    : t("Here's an overview of your active projects.", "Aquí tienes un resumen de tus proyectos activos.");

  const clientPendingTasks = clientTasks.filter((task) => !task.completed).length;
  const clientVisibleDocs = clientDocs.filter((doc) => doc.isClientVisible).length;

  const summaryStats = isClientUser
    ? [
        { label: t("Overall Progress", "Progreso General"), value: projects[0] ? `${projects[0].progressPercent}%` : "—", icon: TrendingUp },
        { label: t("Current Phase", "Fase Actual"), value: projects[0] ? `${projects[0].phaseNumber}/9` : "—", icon: FolderOpen },
        { label: t("Pending Tasks", "Tareas Pendientes"), value: clientTasks.length > 0 ? clientPendingTasks : "—", icon: Clock },
        { label: t("Documents", "Documentos"), value: clientDocs.length > 0 ? clientVisibleDocs : "—", icon: FileText },
      ]
    : [
        { label: t("Active Projects", "Proyectos Activos"), value: summary?.activeProjects ?? "—", icon: FolderOpen },
        { label: t("Total Budget", "Presupuesto Total"), value: summary ? `$${(summary.totalBudget / 1000).toFixed(0)}K` : "—", icon: BarChart3 },
        { label: t("Pending Tasks", "Tareas Pendientes"), value: summary?.pendingTasks ?? "—", icon: Clock },
        { label: t("Documents", "Documentos"), value: summary?.totalDocuments ?? "—", icon: FileText },
      ];

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
      </div>

      {/* Stats bar — compact KPIs kept above the fold next to Active Projects */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryStats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-card-border p-4 shadow-sm" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-konti-olive" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Receipts & Variance shortcut (#B-09) — surface the deeply-nested
          variance tab so the team can jump straight from the dashboard. */}
      {!isClientUser && (
        <Link
          href="/calculator?tab=variance"
          data-testid="link-receipts-variance"
          className="group flex items-start gap-3 p-4 bg-card rounded-xl border border-card-border shadow-sm hover:border-konti-olive/50 hover:bg-muted/30 transition-colors"
        >
          <div className="mt-0.5 w-9 h-9 rounded-md bg-konti-olive/10 flex items-center justify-center text-konti-olive shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">
              {t("Receipts & Variance", "Recibos y Varianza")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "Upload receipts, categorize spend, and compare actuals against the estimate.",
                "Sube recibos, categoriza el gasto y compara real vs. estimado.",
              )}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      )}

      {/* Projects grid — primary landing section, above the fold */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">
          {isClientUser ? t("My Project", "Mi Proyecto") : t("Active Projects", "Proyectos Activos")}
        </h2>
        {projectsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-card-border h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} isClientUser={isClientUser} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity — high-traffic, kept directly under Active Projects */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">{t("Recent Activity", "Actividad Reciente")}</h2>
        <div className="bg-card rounded-xl border border-card-border shadow-sm divide-y divide-border">
          {activity.slice(0, 6).map((item) => {
            const desc = lang === "es" ? item.descriptionEs : item.description;
            const timeAgo = formatDistanceToNow(new Date(item.timestamp), {
              addSuffix: true,
              locale: lang === "es" ? dateEs : undefined,
            });
            const targetProject = projects.find((p) => p.id === item.projectId || p.name === item.projectName);
            const href = targetProject ? `/projects/${targetProject.id}` : null;
            const inner = (
              <>
                <div className="mt-0.5 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <ActivityIcon type={item.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{desc}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-konti-olive">{item.projectName}</span> — {timeAgo}
                  </p>
                </div>
                {href && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />}
              </>
            );
            if (href) {
              return (
                <Link
                  key={item.id}
                  href={href}
                  data-testid={`activity-link-${item.id}`}
                  className="group flex items-start gap-3 p-4 hover:bg-muted/40 transition-colors"
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div key={item.id} className="flex items-start gap-3 p-4" data-testid={`activity-${item.id}`}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {/* Construction status — secondary, large per-project detail. Lives below the fold. */}
      {projects.filter((p) => p.phase === "construction").map((p) => (
        <ConstructionStatusCard
          key={`cs-${p.id}`}
          projectId={p.id}
          projectName={p.name}
          progressPercent={p.progressPercent}
          variant={isClientUser ? "client" : "team"}
          currentStatusNote={p.currentStatusNote}
          currentStatusNoteEs={p.currentStatusNoteEs}
          phaseLabel={p.phaseLabel}
          phaseLabelEs={p.phaseLabelEs}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </RequireAuth>
  );
}
