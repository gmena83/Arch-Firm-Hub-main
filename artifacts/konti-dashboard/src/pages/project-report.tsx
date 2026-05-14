import { useParams, Link } from "wouter";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  useGetProject, useGetProjectWeather, useGetProjectTasks,
  useGetProjectCalculations,
  useGetProjectCostPlus, useGetProjectInspections, useGetProjectMilestones,
  useGetProjectDocuments,
  getGetProjectQueryKey, getGetProjectWeatherQueryKey,
  getGetProjectTasksQueryKey, getGetProjectCalculationsQueryKey,
  getGetProjectCostPlusQueryKey, getGetProjectInspectionsQueryKey, getGetProjectMilestonesQueryKey,
  getGetProjectDocumentsQueryKey,
} from "@workspace/api-client-react";
import { PHOTO_CATEGORY_OPTIONS, photoCategoryLabel, type PhotoCategoryKey } from "@/components/site-photos-gallery";
import { RequireAuth } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { PunchlistPanel } from "@/components/punchlist-panel";
import { ContractorMonitoringSection } from "@/components/contractor-monitoring-section";
import {
  REPORT_BUCKET_KEYS,
  reportBucketLabel,
  rollupRecordByBucket,
  type ReportBucketKey,
} from "@workspace/report-categories";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Check, ArrowLeft, MapPin, Calendar, TrendingUp, Download, Loader2, Sun, Moon, Square, Eye, Settings2 } from "lucide-react";
import logoWhite from "@assets/Horizontal02_WhitePNG_1776258303461.png";
import logoGreen from "@assets/Horizontal02_VerdePNG_1776258303461.png";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";

// Brand-only chart palette — sourced from `--rep-chart-1..5` CSS variables
// declared in `index.css` so the report colors live in one central place
// instead of being duplicated across components. The dark-theme variant of
// these vars nudges olive/slate slightly brighter for contrast against the
// near-black background.
const CHART_COLOR_VARS = [
  "--rep-chart-1",
  "--rep-chart-2",
  "--rep-chart-3",
  "--rep-chart-4",
  "--rep-chart-5",
] as const;
// Hex fallbacks used for SSR or when getComputedStyle hasn't resolved the
// variable yet (very early render). Keep these in sync with `:root` defaults
// in `index.css`.
const CHART_COLOR_FALLBACK = ["#4F5E2A", "#778894", "#A3B38C", "#6F8B58", "#5A6F7C"];

function useReportChartColors(theme: string): string[] {
  // Re-read computed values whenever the theme changes so the cached color
  // array always matches the active `[data-report-theme]` block.
  return useMemo(() => {
    if (typeof window === "undefined") return CHART_COLOR_FALLBACK;
    // Resolve against an element that actually has the data-report-theme
    // attribute applied. We mirror the active theme onto :root via the same
    // attribute below, so `documentElement` is sufficient.
    const root = document.documentElement;
    return CHART_COLOR_VARS.map((cssVar, i) => {
      const v = getComputedStyle(root).getPropertyValue(cssVar).trim();
      return v || CHART_COLOR_FALLBACK[i]!;
    });
  }, [theme]);
}

// Industry-typical share of project budget per macro phase. Sums to 1.00.
const PHASE_BUDGET_WEIGHTS: Record<string, number> = {
  discovery: 0.01,
  consultation: 0.01,
  pre_design: 0.04,
  schematic_design: 0.05,
  design_development: 0.07,
  construction_documents: 0.08,
  permits: 0.04,
  construction: 0.65,
  completed: 0.05,
};

type ReportTheme = "light" | "white" | "dark";
const REPORT_THEME_KEY = "konti.report.theme";
const REPORT_DATE_KEY = "konti.report.date";
// Cycle order driven by the single-button toggle in the report header.
const THEME_CYCLE: Record<ReportTheme, ReportTheme> = {
  light: "white",
  white: "dark",
  dark: "light",
};

function loadInitialTheme(projectId?: string): ReportTheme {
  if (typeof window === "undefined") return "light";
  // Per-project preference takes priority; fall back to the legacy global key
  // for users who set a theme before the per-project storage existed.
  const perProject = projectId
    ? window.localStorage.getItem(`${REPORT_THEME_KEY}.${projectId}`)
    : null;
  const stored = perProject ?? window.localStorage.getItem(REPORT_THEME_KEY);
  if (stored === "dark" || stored === "white" || stored === "light") return stored;
  return "light";
}

// ISO yyyy-mm-dd today in local time (avoids the toISOString UTC shift on
// late-evening Puerto Rico timestamps).
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadInitialReportDate(projectId: string): string {
  if (typeof window === "undefined") return todayIso();
  const stored = window.localStorage.getItem(`${REPORT_DATE_KEY}.${projectId}`);
  // Validate yyyy-mm-dd shape.
  return stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : todayIso();
}

// Report theme tokens (`--rep-bg`, `--rep-fg`, `--rep-surface`, etc.) are
// declared in `index.css` under `[data-report-theme="light|white|dark"]`
// selectors and reference the central KONTi brand palette. The page applies
// the active theme by setting `data-report-theme` on the report root, so
// every nested component can read the tokens without having to receive an
// inline style prop.

interface ReportTemplate { name: string; columns: string[]; headerLines: string[]; footer: string }
interface ContractorLine { id: string; category: string; description: string; descriptionEs: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }
interface ContractorEstimate {
  lines: ContractorLine[];
  grandTotal: number;
  subtotalMaterials: number;
  subtotalLabor: number;
  subtotalSubcontractor: number;
  contingencyPercent: number;
  contingency: number;
  marginPercent?: number;
  marginAmount?: number;
  managementFeePercent?: number;
  managementFeeAmount?: number;
}

const DEFAULT_REPORT_COLUMNS = ["Category", "Item", "Qty", "Unit", "Unit Price", "Total"];

function reportCellForColumn(col: string, line: ContractorLine, lang: string): string {
  const c = col.trim().toLowerCase();
  if (c === "category" || c === "categoría" || c === "categoria") return line.category;
  if (c === "item" || c === "description" || c === "descripción" || c === "descripcion") return lang === "es" ? line.descriptionEs : line.description;
  if (c === "qty" || c === "quantity" || c === "cant." || c === "cantidad") return String(line.quantity);
  if (c === "unit" || c === "unidad") return line.unit;
  if (c === "unit price" || c === "precio unit." || c === "precio unitario") return `$${line.unitPrice.toLocaleString()}`;
  if (c === "total") return `$${line.lineTotal.toLocaleString()}`;
  return "";
}

function ReportContent({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { viewRole } = useAuth();
  const isClientView = viewRole === "client";
  const [isDownloading, setIsDownloading] = useState(false);
  // P2.6 — Preview PDF state. Opens a modal iframe rather than triggering a
  // download so the team can confirm the layout before sending to the client.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // P2.2 — section visibility state. `sections` is a map of REPORT_SECTION_KEYS
  // → bool. Undefined values default to `true` (everything visible per the
  // meeting). Drawer state controls whether the settings panel is open.
  const [sectionsVisibility, setSectionsVisibility] = useState<Record<string, boolean>>({});
  const [showVisibilityDrawer, setShowVisibilityDrawer] = useState(false);
  const isSectionVisible = (key: string) => sectionsVisibility[key] !== false;
  // Tracks which Cost-by-Category bucket rows are showing their trade-level
  // sub-lines. We default to "all expanded" when the team or admin opens the
  // report so the detailed breakdown is visible without an extra click; the
  // initial set is recomputed once `bucketRows` resolves below.
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(() => new Set());
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [contractorEst, setContractorEst] = useState<ContractorEstimate | null>(null);
  const [theme, setTheme] = useState<ReportTheme>(() => loadInitialTheme(projectId));
  // "Bright" preset (sand-tinted Light or pure White) shares typography,
  // tooltip, and logo treatment; only Dark inverts them.
  const isLight = theme !== "dark";

  // Editable report date (#C-10) — defaults to today, persisted per project so
  // a team member can re-open the same report and continue editing the same
  // weekly snapshot. Tracked alongside the loaded projectId so navigating
  // between two project reports doesn't accidentally write project A's date
  // into project B's storage key.
  const [reportDateIso, setReportDateIso] = useState<string>(() => loadInitialReportDate(projectId));
  const [loadedProjectId, setLoadedProjectId] = useState<string>(projectId);

  // Reload the persisted date whenever the active projectId changes (route
  // change between different project reports).
  useEffect(() => {
    if (projectId !== loadedProjectId) {
      setReportDateIso(loadInitialReportDate(projectId));
      setLoadedProjectId(projectId);
    }
  }, [projectId, loadedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Persist per-project so each project remembers its own preferred theme,
    // and mirror to the legacy global key so opening a brand-new project
    // still respects the user's most-recent choice.
    if (projectId && loadedProjectId === projectId) {
      window.localStorage.setItem(`${REPORT_THEME_KEY}.${projectId}`, theme);
    }
    window.localStorage.setItem(REPORT_THEME_KEY, theme);
  }, [theme, projectId, loadedProjectId]);

  // Reload theme when navigating between project reports (project-scoped pref).
  useEffect(() => {
    if (projectId !== loadedProjectId) {
      setTheme(loadInitialTheme(projectId));
    }
  }, [projectId, loadedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!reportDateIso) return;
    // Only persist into the project the date is actually loaded for. This
    // guards against a race where projectId has changed but the next render
    // hasn't yet reloaded reportDateIso from the new project's storage key.
    if (loadedProjectId !== projectId) return;
    window.localStorage.setItem(`${REPORT_DATE_KEY}.${projectId}`, reportDateIso);
  }, [reportDateIso, projectId, loadedProjectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancel = false;
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
    let token: string | undefined;
    try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    fetch(`/api/projects/${projectId}/report-template`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancel && d) setTemplate(d as ReportTemplate); })
      .catch(() => undefined);
    // The contractor BOM is internal-only. Skip the request entirely for
    // client viewers so the raw line items never reach the browser even if
    // someone opens devtools.
    if (!isClientView) {
      fetch(`/api/projects/${projectId}/contractor-estimate`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (!cancel && d) setContractorEst(d as ContractorEstimate); })
        .catch(() => undefined);
    }
    return () => { cancel = true; };
  }, [projectId, isClientView]);

  const { data: project } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });
  const { data: weather } = useGetProjectWeather(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectWeatherQueryKey(projectId) }
  });
  const { data: tasks = [] } = useGetProjectTasks(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectTasksQueryKey(projectId) }
  });
  // Backend gates /projects/:id/calculations to team/admin/architect roles, so
  // skip the request entirely for client viewers to avoid noisy 403s and to let
  // downstream UI render the gated-empty state instead of stale fallback data.
  const { data: calc } = useGetProjectCalculations(projectId, {
    query: {
      enabled: !!projectId && !isClientView,
      queryKey: getGetProjectCalculationsQueryKey(projectId),
    },
  });

  // Client-safe report rollup. The /report-rollup endpoint exposes only the
  // five canonical buckets (with optional trade-level sub-lines) and the
  // grand total — never raw BOM line items — so it can be opened to client
  // viewers and we don't have to gate the cost-by-category card behind the
  // team-only /calculations endpoint anymore. We fetch it for every viewer
  // (including the team) so the bucket display has a single source of truth.
  type ReportRollupResponse = {
    projectId: string;
    subtotalByBucket: Record<string, number>;
    bucketRollup: Array<{
      key: string;
      labelEn: string;
      labelEs: string;
      total: number;
      lines: Array<{ category: string; labelEn: string; labelEs: string; total: number }>;
    }>;
    grandTotal: number;
  };
  const [reportRollup, setReportRollup] = useState<ReportRollupResponse | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancel = false;
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
    let token: string | undefined;
    try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    fetch(`/api/projects/${projectId}/report-rollup`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancel && d) setReportRollup(d as ReportRollupResponse); })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, [projectId]);
  const { data: costPlus } = useGetProjectCostPlus(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectCostPlusQueryKey(projectId) }
  });
  const { data: inspectionsData } = useGetProjectInspections(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectInspectionsQueryKey(projectId) }
  });
  const { data: milestonesData } = useGetProjectMilestones(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectMilestonesQueryKey(projectId) }
  });
  const inspections = inspectionsData?.inspections ?? [];
  const milestones = milestonesData?.milestones ?? [];

  // Site Photos block (#105). Mirror the gallery's role-based visibility filter
  // so the PDF rasterized from this report doesn't leak internal-only photos
  // when the report is opened by a client.
  const { data: allDocs = [] } = useGetProjectDocuments(projectId, undefined, {
    query: { enabled: !!projectId, queryKey: getGetProjectDocumentsQueryKey(projectId, undefined) },
  });
  type ReportPhoto = {
    id: string;
    name: string;
    photoCategory?: string;
    caption?: string;
    imageUrl?: string;
    // Drive-backed photo URL fields (Task #128). When the project's docs
    // live in Google Drive the API strips the inline data: URL so we have
    // to fall back to one of these to render the report image.
    driveThumbnailLink?: string;
    driveDownloadProxyUrl?: string;
    driveWebContentLink?: string;
    isClientVisible: boolean;
    // P2.3 — featuredAsCover wins over chronological order within its category.
    featuredAsCover?: boolean;
  };
  // Prefer the Drive thumbnail (lightweight, signed) → proxy (works for
  // every role incl. client) → legacy inline imageUrl fallback.
  const pickReportPhotoUrl = (p: ReportPhoto): string | undefined =>
    p.driveThumbnailLink ?? p.driveDownloadProxyUrl ?? p.driveWebContentLink ?? resolveSeedImageUrl(p.imageUrl);
  const reportPhotos = useMemo<ReportPhoto[]>(() => (
    (allDocs as ReportPhoto[] & { type?: string }[])
      .filter((d) => (d as { type?: string }).type === "photo")
      .filter((d) => !isClientView || d.isClientVisible)
      .filter((d) => typeof d.photoCategory === "string")
  ), [allDocs, isClientView]);
  const photosByCategory = useMemo<Record<PhotoCategoryKey, ReportPhoto[]>>(() => {
    const out: Record<PhotoCategoryKey, ReportPhoto[]> = {
      site_conditions: [], construction_progress: [], punchlist_evidence: [], final: [],
    };
    for (const p of reportPhotos) {
      const k = p.photoCategory as PhotoCategoryKey | undefined;
      if (k && k in out) out[k].push(p);
    }
    // P2.3 — within each category, push featuredAsCover photos to the front
    // so the report's hero image always matches the project-card cover photo
    // the team curated via the gallery's "Set as cover" affordance.
    for (const k of Object.keys(out) as PhotoCategoryKey[]) {
      out[k].sort((a, b) => (b.featuredAsCover === true ? 1 : 0) - (a.featuredAsCover === true ? 1 : 0));
    }
    return out;
  }, [reportPhotos]);

  // P2.2 — fetch the project's report-section visibility on mount.
  useEffect(() => {
    if (!projectId) return;
    let cancel = false;
    const stored = (() => {
      try {
        const raw = localStorage.getItem("konti_auth");
        return raw ? (JSON.parse(raw) as { token?: string | null }) : null;
      } catch { return null; }
    })();
    const headers: Record<string, string> = stored?.token ? { Authorization: `Bearer ${stored.token}` } : {};
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/projects/${projectId}/report-visibility`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel || !d) return;
        const map: Record<string, boolean> = {};
        for (const s of (d.sections ?? []) as Array<{ key: string; visible: boolean }>) {
          map[s.key] = s.visible;
        }
        setSectionsVisibility(map);
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, [projectId]);

  // P2.2 — save a single section toggle. PATCH the full sanitized map so the
  // server gets a consistent snapshot; the GET-fetch on mount will repopulate.
  const toggleSectionVisibility = async (key: string, visible: boolean) => {
    const next = { ...sectionsVisibility, [key]: visible };
    setSectionsVisibility(next); // optimistic
    try {
      const stored = (() => {
        try {
          const raw = localStorage.getItem("konti_auth");
          return raw ? (JSON.parse(raw) as { token?: string | null }) : null;
        } catch { return null; }
      })();
      const headers: Record<string, string> = stored?.token
        ? { Authorization: `Bearer ${stored.token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/projects/${projectId}/report-visibility`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sections: next }),
      });
      if (!res.ok) throw new Error("save_failed");
    } catch {
      // Roll back optimistic if save failed — keep state consistent with server.
      setSectionsVisibility(sectionsVisibility);
    }
  };

  // P2.6 — Preview the PDF inline. Uses the same /pdf endpoint as Download
  // but renders the result inside an iframe so the team can sanity-check
  // the layout before exporting.
  async function previewPdf() {
    if (!project || isPreviewing) return;
    setIsPreviewing(true);
    try {
      const stored = (() => {
        try {
          const raw = localStorage.getItem("konti_auth");
          return raw ? (JSON.parse(raw) as { token?: string | null }) : null;
        } catch { return null; }
      })();
      const headers: Record<string, string> = stored?.token
        ? { Authorization: `Bearer ${stored.token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/projects/${projectId}/pdf`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reportDate, sections: sectionsVisibility }),
      });
      if (!res.ok) throw new Error("preview_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch {
      // Surface as a no-op rather than a toast — Download still works.
    } finally {
      setIsPreviewing(false);
    }
  }

  async function downloadPdf() {
    if (!project || isDownloading) return;
    setIsDownloading(true);
    try {
      // The /pdf endpoint requires auth; raw fetch needs the Bearer header.
      const stored = (() => {
        try {
          const raw = localStorage.getItem("konti_auth");
          return raw ? (JSON.parse(raw) as { token?: string | null }) : null;
        } catch { return null; }
      })();
      const headers: Record<string, string> = stored?.token
        ? { Authorization: `Bearer ${stored.token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
      // Pass the editable report date (#C-10) so the exported PDF stamps the
      // same date the team selected in the report header instead of "today".
      const response = await fetch(`/api/projects/${project.id}/pdf`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reportDate: reportDateIso }),
      });
      if (!response.ok) {
        window.print();
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `KONTi-Report-${project.name.replace(/\s+/g, "-")}-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.print();
    } finally {
      setIsDownloading(false);
    }
  }

  // Mirror the active report theme onto :root so the `--rep-*` and
  // `--rep-chart-*` CSS variables declared in `index.css` resolve at the
  // documentElement level. That lets nested portals (recharts tooltips,
  // dropdowns) and our `useReportChartColors` hook read consistent values
  // without each consumer having to set its own inline `style` block.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.documentElement.getAttribute("data-report-theme");
    document.documentElement.setAttribute("data-report-theme", theme);
    return () => {
      if (prev === null) {
        document.documentElement.removeAttribute("data-report-theme");
      } else {
        document.documentElement.setAttribute("data-report-theme", prev);
      }
    };
  }, [theme]);

  const chartColors = useReportChartColors(theme);

  // Hoisted above the early return so hook order stays stable.
  const phases = useMemo(() => [
    { key: "discovery", label: t("Discovery", "Descubrimiento"), num: 1 },
    { key: "consultation", label: t("Consultation", "Consulta"), num: 2 },
    { key: "pre_design", label: t("Pre-Design", "Pre-Diseño"), num: 3 },
    { key: "schematic_design", label: t("Schematic Design", "Diseño Esquemático"), num: 4 },
    { key: "design_development", label: t("Design Development", "Desarrollo de Diseño"), num: 5 },
    { key: "construction_documents", label: t("Construction Documents", "Documentos de Construcción"), num: 6 },
    { key: "permits", label: t("Permits", "Permisos"), num: 7 },
    { key: "construction", label: t("Construction", "Construcción"), num: 8 },
    { key: "completed", label: t("Completed", "Completado"), num: 9 },
  ], [t]);

  // Phase-completion data for the donut (#C-04) — completed phases count as
  // 100% and the current phase counts as the project's overall progress so
  // partial work is visible. Hoisted above the early `!project` return so the
  // hook order stays stable across renders.
  const projectPhaseNumber = project?.phaseNumber ?? 0;
  const projectProgressPercent = project?.progressPercent ?? 0;
  const phaseCompletionData = useMemo(() => {
    return phases.map((p) => {
      const pct = p.num < projectPhaseNumber
        ? 100
        : p.num === projectPhaseNumber
          ? Math.max(0, Math.min(100, projectProgressPercent))
          : 0;
      return { key: p.key, name: p.label, value: pct };
    });
  }, [phases, projectPhaseNumber, projectProgressPercent]);

  const budgetAllocated = project?.budgetAllocated ?? 0;
  const phaseBudgetData = useMemo(() => {
    if (budgetAllocated <= 0) return [] as Array<{ key: string; name: string; value: number }>;
    return phases
      .map((p) => ({
        key: p.key,
        name: p.label,
        value: Math.round((PHASE_BUDGET_WEIGHTS[p.key] ?? 0) * budgetAllocated),
      }))
      .filter((row) => row.value > 0);
  }, [phases, budgetAllocated]);
  const phaseBudgetTotal = phaseBudgetData.reduce((sum, r) => sum + r.value, 0);

  if (!project) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[color:var(--rep-bg)] text-[color:var(--rep-fg)]"
        data-report-theme={theme}
      >
        Loading report...
      </div>
    );
  }

  const phaseLabel = lang === "es" ? project.phaseLabelEs : project.phaseLabel;
  const spendPct = Math.round((project.budgetUsed / project.budgetAllocated) * 100);
  const completedTasks = tasks.filter((task) => task.completed);
  const pendingTasks = tasks.filter((task) => !task.completed);

  // Roll the trade-level subtotals into the team's five canonical PROJECT
  // ESTIMATE buckets so the client-facing report mirrors the structure the
  // team emails. The api-server already returns `subtotalByBucket`/`bucketRollup`
  // when present; we re-derive client-side from `subtotalByCategory` as a
  // resilient fallback (e.g. older deployments, or a future report path that
  // assembles the rollup from a different data source).
  // Bucket rows for the Cost-by-Category card. Sourced in priority order:
  //   1. The client-safe `/report-rollup` response (works for every viewer
  //      and includes per-bucket sub-lines for the expand-row UI).
  //   2. The team-only `/calculations` response (`subtotalByBucket` if
  //      present, or re-derived from `subtotalByCategory` as a fallback for
  //      older deployments). Sub-lines are derived locally so the team view
  //      still gets the expand-row affordance even before the rollup
  //      endpoint resolves.
  //   3. Five empty buckets (all zero, no sub-lines) so the structure is
  //      always visible even if neither request has finished yet.
  type BucketSubLineUI = { category: string; label: string; total: number };
  type BucketRow = {
    key: ReportBucketKey;
    label: string;
    total: number;
    lines: BucketSubLineUI[];
  };
  const calcWithBucket = calc as
    | (typeof calc & { subtotalByBucket?: Record<string, number> })
    | undefined;
  const bucketRows: BucketRow[] = (() => {
    if (reportRollup?.bucketRollup) {
      return REPORT_BUCKET_KEYS.map((key) => {
        const row = reportRollup.bucketRollup.find((r) => r.key === key);
        return {
          key,
          label: reportBucketLabel(key, lang),
          total: row?.total ?? 0,
          lines: (row?.lines ?? []).map((line) => ({
            category: line.category,
            label: lang === "es" ? line.labelEs : line.labelEn,
            total: line.total,
          })),
        };
      });
    }
    if (!calc?.subtotalByCategory) {
      return REPORT_BUCKET_KEYS.map((key) => ({
        key,
        label: reportBucketLabel(key, lang),
        total: 0,
        lines: [],
      }));
    }
    // Local fallback: derive sub-lines from the team-only calculations
    // payload. Uses the same `rollupRecordByBucket` helper the backend
    // uses, so the structure matches exactly.
    const localRollup = rollupRecordByBucket(calc.subtotalByCategory);
    const fromServer = calcWithBucket?.subtotalByBucket;
    return REPORT_BUCKET_KEYS.map((key) => {
      const row = localRollup.find((r) => r.key === key);
      return {
        key,
        label: reportBucketLabel(key, lang),
        total: fromServer?.[key] ?? row?.total ?? 0,
        lines: (row?.lines ?? []).map((line) => ({
          category: line.category,
          label: lang === "es" ? line.labelEs : line.labelEn,
          total: line.total,
        })),
      };
    });
  })();

  const categoryRows = bucketRows;
  const categoryTotal = categoryRows.reduce((sum, r) => sum + r.total, 0);
  // Pie chart: only render buckets that actually have spend so the donut
  // doesn't show empty slivers, but the table below it always lists all five
  // canonical buckets so clients can see the structure.
  const chartData = bucketRows
    .filter((r) => r.total > 0)
    .map((r) => ({ name: r.label, value: r.total }));

  // Render the editable yyyy-mm-dd in the user's locale for display in the
  // sticky header. Parse as local time (append T00:00) so the displayed day
  // matches the picker exactly across timezones.
  const reportDate = new Date(`${reportDateIso}T00:00:00`).toLocaleDateString(
    lang === "es" ? "es-PR" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const phaseCompletionTotal = phaseCompletionData.reduce((a, b) => a + b.value, 0);
  const phaseCompletionAvg = phases.length > 0 ? Math.round(phaseCompletionTotal / phases.length) : 0;

  // Recharts tooltip styled via the report's CSS variables so it stays
  // readable on every theme without component-level branching. Recharts
  // portals tooltips outside the report root, so reading from `:root`
  // (which the theme effect mirrors above) is required for the colors to
  // resolve correctly.
  const tooltipContentStyle: React.CSSProperties = {
    background: "var(--rep-tooltip-bg)",
    border: "1px solid var(--rep-tooltip-border)",
    borderRadius: 8,
    color: "var(--rep-tooltip-fg)",
    boxShadow: "var(--rep-tooltip-shadow)",
  };

  const reportLogo = isLight ? logoGreen : logoWhite;

  return (
    <div
      // `dark` class flips global tokens for nested panels (e.g. PunchlistPanel).
      className={`min-h-screen bg-[color:var(--rep-bg)] text-[color:var(--rep-fg)] ${isLight ? "" : "dark"}`}
      data-testid="project-report-page"
      data-report-theme={theme}
    >
      {/* Header */}
      <div className="bg-[color:var(--rep-bg)] border-b border-[color:var(--rep-border)] px-4 sm:px-6 md:px-12 py-4 sm:py-5 flex items-center justify-between gap-4 sm:gap-6 flex-wrap sticky top-0 z-10">
        <img src={reportLogo} alt="KONTi" className="h-20 sm:h-24 md:h-28 w-auto shrink-0" data-testid="report-logo" />
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <label className="hidden sm:flex items-center gap-1.5 text-[color:var(--rep-fg-soft)] text-xs">
            <span>{t("Progress Report", "Reporte de Progreso")} —</span>
            <input
              type="date"
              value={reportDateIso}
              onChange={(e) => setReportDateIso(e.target.value || todayIso())}
              data-testid="input-report-date"
              aria-label={t("Report date", "Fecha del reporte")}
              title={t("Report date — saved per project", "Fecha del reporte — se guarda por proyecto")}
              className="bg-transparent border border-[color:var(--rep-border-strong)] rounded-md px-1.5 py-0.5 text-[color:var(--rep-fg-strong)] text-xs focus:outline-none focus:ring-1 focus:ring-konti-olive [color-scheme:light] dark:[color-scheme:dark]"
            />
            <span className="text-[color:var(--rep-fg-faint)]">· {reportDate}</span>
          </label>
          {(() => {
            const next = THEME_CYCLE[theme];
            const themeLabelEn = theme === "light" ? "Light" : theme === "white" ? "White" : "Dark";
            const themeLabelEs = theme === "light" ? "Claro" : theme === "white" ? "Blanco" : "Oscuro";
            const nextLabelEn = next === "light" ? "Light" : next === "white" ? "White background" : "Dark";
            const nextLabelEs = next === "light" ? "Claro" : next === "white" ? "Fondo blanco" : "Oscuro";
            const Icon = theme === "light" ? Square : theme === "white" ? Moon : Sun;
            return (
              <button
                onClick={() => setTheme(next)}
                data-testid="btn-toggle-theme"
                data-report-theme-current={theme}
                aria-label={t(`Theme: ${themeLabelEn}. Switch to ${nextLabelEn}.`, `Tema: ${themeLabelEs}. Cambiar a ${nextLabelEs}.`)}
                title={t(`Theme: ${themeLabelEn} → ${nextLabelEn}`, `Tema: ${themeLabelEs} → ${nextLabelEs}`)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[color:var(--rep-border-strong)] text-[color:var(--rep-fg-muted)] hover:text-[color:var(--rep-fg-strong)] hover:bg-[color:var(--rep-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-konti-olive focus-visible:ring-offset-1 transition-colors"
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })()}
          {/* P2.6 — Preview button. Renders the same /pdf output but inline
              so the team can confirm the layout before downloading. */}
          <button
            onClick={previewPdf}
            disabled={isPreviewing || isDownloading}
            data-testid="btn-preview-pdf"
            aria-label={t("Preview PDF inline before sending", "Vista previa del PDF antes de enviar")}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[color:var(--rep-border-strong)] text-[color:var(--rep-fg-muted)] hover:text-[color:var(--rep-fg-strong)] hover:bg-[color:var(--rep-surface-2)] disabled:opacity-50 transition-colors"
            title={t("Preview PDF", "Vista previa PDF")}
          >
            {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          </button>
          {/* P2.2 — Section visibility settings (team-only). */}
          {!isClientView && (
            <button
              onClick={() => setShowVisibilityDrawer(true)}
              data-testid="btn-report-visibility"
              aria-label={t("Configure which sections the client sees", "Configurar qué secciones ve el cliente")}
              title={t("Section visibility", "Visibilidad de secciones")}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[color:var(--rep-border-strong)] text-[color:var(--rep-fg-muted)] hover:text-[color:var(--rep-fg-strong)] hover:bg-[color:var(--rep-surface-2)] transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={downloadPdf}
            disabled={isDownloading}
            data-testid="btn-download-pdf"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-konti-olive text-white text-xs font-semibold hover:bg-konti-olive/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isDownloading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("Generating…", "Generando…")}</>
              : <><Download className="w-3.5 h-3.5" /> {t("Download PDF", "Descargar PDF")}</>
            }
          </button>
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-1.5 text-xs text-[color:var(--rep-fg-muted)] hover:text-[color:var(--rep-fg-strong)] transition-colors"
            data-testid="link-back-from-report"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t("Back to Project", "Volver al Proyecto")}
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12 py-8 md:py-12 space-y-12 md:space-y-16">
        {template && template.headerLines.length > 0 && (
          <div className="border border-konti-olive/40 bg-konti-olive/5 rounded-lg p-4 text-center" data-testid="report-template-header">
            <p className="text-[10px] uppercase tracking-widest text-konti-olive/80 mb-2">{t("Template", "Plantilla")}: {template.name}</p>
            {template.headerLines.map((line, i) => (
              <p key={i} className="text-[color:var(--rep-fg-muted)] text-sm">{line}</p>
            ))}
          </div>
        )}
        {/* Hero section */}
        <section className="text-center space-y-4">
          <div className="inline-block bg-konti-olive/20 text-konti-olive text-xs font-semibold px-4 py-1.5 rounded-full border border-konti-olive/30">
            {phaseLabel}
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold text-[color:var(--rep-fg-strong)] leading-tight">
            {project.name}
          </h1>
          <p className="text-[color:var(--rep-fg-muted)] text-lg max-w-2xl mx-auto">
            {project.description}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[color:var(--rep-fg-soft)]">
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {project.location}</span>
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {project.startDate} → {project.estimatedEndDate}</span>
          </div>
        </section>

        {/* Key metrics */}
        <section>
          <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-6">
            {t("Key Metrics", "Métricas Clave")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t("Overall Progress", "Progreso General"), value: `${project.progressPercent}%`, sub: t("completion", "completado") },
              { label: t("Budget Used", "Presupuesto Usado"), value: `${spendPct}%`, sub: `$${project.budgetUsed.toLocaleString()} / $${project.budgetAllocated.toLocaleString()}` },
              { label: t("Tasks Completed", "Tareas Completadas"), value: `${completedTasks.length}`, sub: `${t("of", "de")} ${tasks.length} ${t("total", "total")}` },
              { label: t("Weather Status", "Estado del Clima"), value: weather?.buildSuitabilityLabel ?? "—", sub: weather?.city ?? "" },
            ].map((metric) => (
              <div key={metric.label} className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-5">
                <p className="text-[color:var(--rep-fg-faint)] text-xs mb-2">{metric.label}</p>
                <p className="text-[color:var(--rep-fg-strong)] text-3xl font-bold leading-none mb-1">{metric.value}</p>
                <p className="text-[color:var(--rep-fg-soft)] text-xs">{metric.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Progress bar */}
        <section className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-6">
          <div className="flex justify-between mb-3">
            <h2 className="text-[color:var(--rep-fg-strong)] font-bold">{t("Overall Progress", "Progreso General")}</h2>
            <span className="text-3xl font-bold text-konti-olive">{project.progressPercent}%</span>
          </div>
          <div className="h-4 rounded-full bg-[color:var(--rep-surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full bg-konti-olive transition-all"
              style={{ width: `${project.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-3">
            <span className="text-[color:var(--rep-fg-faint)] text-xs">{project.startDate}</span>
            <span className="text-[color:var(--rep-fg-faint)] text-xs">{project.estimatedEndDate}</span>
          </div>
        </section>

        {/* Phase progress donut (#C-04) — mirrors the team's punchlist
            phase-pie style and replaces the older budget-only phase chart
            as the headline phase visualization. Phase numbers are not
            shown (#C-03) so the chart stays readable next to the punchlist. */}
        <section className="grid md:grid-cols-2 gap-8 items-center" data-testid="report-phase-progress">
          <div>
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Phase Progress", "Progreso por Fase")}
            </h2>
            <p className="text-[color:var(--rep-fg-soft)] text-xs mb-3">
              {t(
                "Completion percentage per macro phase — completed phases count as 100%, the current phase reflects the project's overall progress.",
                "Porcentaje de completado por fase — las fases completadas cuentan como 100% y la fase actual refleja el progreso general del proyecto.",
              )}
            </p>
            <div className="space-y-1.5">
              {phaseCompletionData.map((item, i) => (
                <div key={item.key} className="flex items-center justify-between" data-testid={`phase-progress-row-${item.key}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                    <span className="text-xs text-[color:var(--rep-fg-muted)] truncate">{item.name}</span>
                  </div>
                  <span className="text-xs font-medium text-[color:var(--rep-fg-strong)] tabular-nums shrink-0 ml-2">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={phaseCompletionData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                  {phaseCompletionData.map((_, index) => (
                    <Cell key={`phase-progress-cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} contentStyle={tooltipContentStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-[color:var(--rep-fg-strong)] leading-none">{phaseCompletionAvg}%</span>
              <span className="text-[10px] text-[color:var(--rep-fg-faint)] uppercase tracking-widest mt-1">{t("avg", "prom")}</span>
            </div>
          </div>
        </section>

        {/* Phase timeline */}
        <section>
          <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-6">
            {t("Phase Timeline", "Línea de Tiempo de Fases")}
          </h2>
          <div className="flex gap-2 sm:gap-3 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2">
            {phases.map((phase) => {
              const isCompleted = project.phaseNumber > phase.num;
              const isCurrent = project.phaseNumber === phase.num;
              return (
                <div key={phase.key} className="flex-1 min-w-[60px] text-center">
                  <div className={`h-1 rounded-full mb-3 ${isCompleted ? "bg-konti-olive" : isCurrent ? "bg-konti-olive/50" : "bg-[color:var(--rep-surface-2)]"}`} />
                  <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center mb-2 ${
                    isCompleted ? "bg-konti-olive text-white" :
                    isCurrent ? "border-2 border-konti-olive bg-transparent" :
                    "bg-[color:var(--rep-surface-2)]"
                  }`}>
                    {isCompleted
                      ? <Check className="w-3.5 h-3.5" />
                      : isCurrent
                        ? <span className="w-2 h-2 rounded-full bg-konti-olive" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--rep-fg-faint)]" />
                    }
                  </div>
                  <p className={`text-xs leading-tight hidden md:block ${isCurrent ? "text-konti-olive font-semibold" : "text-[color:var(--rep-fg-soft)]"}`}>{phase.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Site Photos block (#105). Up to 6 thumbs per category with caption,
            linking back to the full gallery on the project detail page. */}
        {reportPhotos.length > 0 && (
          <section data-testid="report-photos-block">
            <div className="flex items-end justify-between mb-6 gap-4">
              <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest">
                {t("Site Photos", "Fotos del Sitio")}
              </h2>
              <Link
                href={`/projects/${projectId}#photos`}
                data-testid="link-view-all-photos"
                className="text-xs text-konti-olive hover:underline"
              >
                {t(`View all ${reportPhotos.length} photos →`, `Ver las ${reportPhotos.length} fotos →`)}
              </Link>
            </div>
            <div className="space-y-6">
              {PHOTO_CATEGORY_OPTIONS.map((cat) => {
                const items = photosByCategory[cat.key].slice(0, 6);
                if (items.length === 0) return null;
                return (
                  <div key={cat.key} data-testid={`report-photo-category-${cat.key}`}>
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--rep-fg-soft)]">
                        {photoCategoryLabel(cat.key, lang)}
                      </p>
                      <span className="text-[11px] text-[color:var(--rep-fg-faint)]">
                        {photosByCategory[cat.key].length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      {items.map((p) => (
                        <div
                          key={p.id}
                          data-testid={`report-photo-thumb-${p.id}`}
                          className="space-y-1"
                        >
                          <div className="aspect-square rounded-md overflow-hidden border border-[color:var(--rep-border)] bg-[color:var(--rep-surface-2)]">
                            {pickReportPhotoUrl(p) ? (
                              <img
                                src={pickReportPhotoUrl(p)}
                                alt={p.caption ?? p.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : null}
                          </div>
                          {p.caption && (
                            <p className="text-[10px] leading-tight text-[color:var(--rep-fg-soft)] line-clamp-2">
                              {p.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Budget breakdown — pie by canonical bucket. Hidden entirely when
            no bucket has spend yet so the report doesn't show an empty donut;
            the structured Cost-by-Category table below still surfaces the
            five-bucket layout with "—" placeholders. */}
        {chartData.length > 0 && (
          <section className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
                {t("Budget Breakdown", "Desglose del Presupuesto")}
              </h2>
              <div className="space-y-2">
                {chartData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                      <span className="text-sm text-[color:var(--rep-fg-muted)]">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-[color:var(--rep-fg-strong)]">${item.value.toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-[color:var(--rep-border)] pt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-[color:var(--rep-fg-strong)]">{t("Grand Total", "Total General")}</span>
                  <span className="text-sm font-bold text-konti-olive">${chartData.reduce((a, b) => a + b.value, 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, ""]} contentStyle={tooltipContentStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Budget by phase */}
        {phaseBudgetTotal > 0 && (
          <section className="grid md:grid-cols-2 gap-8 items-center" data-testid="report-budget-by-phase">
            <div>
              <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
                {t("Budget by Phase", "Presupuesto por Fase")}
              </h2>
              <p className="text-[color:var(--rep-fg-soft)] text-xs mb-3">
                {t(
                  "Estimated distribution of the allocated budget across macro phases (industry baseline) — not actual spend by phase.",
                  "Distribución estimada del presupuesto asignado entre las fases macro (referencia de la industria) — no representa el gasto real por fase.",
                )}
              </p>
              <div className="space-y-2">
                {phaseBudgetData.map((item, i) => (
                  <div key={item.key} className="flex items-center justify-between" data-testid={`phase-budget-row-${item.key}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                      <span className="text-sm text-[color:var(--rep-fg-muted)]">{item.name}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-[color:var(--rep-fg-strong)]">${item.value.toLocaleString()}</span>
                      <span className="text-xs text-[color:var(--rep-fg-faint)] tabular-nums">
                        {Math.round((item.value / phaseBudgetTotal) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
                <div className="border-t border-[color:var(--rep-border)] pt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-[color:var(--rep-fg-strong)]">{t("Allocated Budget", "Presupuesto Asignado")}</span>
                  <span className="text-sm font-bold text-konti-olive">${phaseBudgetTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={phaseBudgetData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                    {phaseBudgetData.map((_, index) => (
                      <Cell key={`phase-cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} contentStyle={tooltipContentStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Cost-Plus breakdown */}
        {costPlus && (
          <section data-testid="report-cost-plus">
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Cost-Plus Budget", "Presupuesto Cost-Plus")}
            </h2>
            <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-6 space-y-2">
              {[
                { label: t("Materials", "Materiales"), value: costPlus.materialsCost },
                { label: t("Labor", "Mano de Obra"), value: costPlus.laborCost },
                { label: t("Subcontractors", "Subcontratistas"), value: costPlus.subcontractorCost },
              ].map((row) => (
                <div key={row.label} className="flex justify-between text-sm text-[color:var(--rep-fg-muted)]">
                  <span>{row.label}</span>
                  <span className="text-[color:var(--rep-fg-strong)]">${row.value.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-[color:var(--rep-border)] pt-2 text-sm">
                <span className="text-[color:var(--rep-fg-soft)] font-medium">{t("Subtotal", "Subtotal")}</span>
                <span className="font-semibold text-[color:var(--rep-fg-strong)]">${costPlus.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-konti-olive/20 border border-konti-olive/40 rounded-md px-3 py-2 my-1">
                <span className="text-konti-olive font-semibold">
                  {t("Plus Management Fee", "Cargo de Administración Plus")} ({costPlus.plusFeePercent}%)
                </span>
                <span className="text-konti-olive font-bold">${costPlus.plusFeeAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-[color:var(--rep-border)] pt-3">
                <span className="text-[color:var(--rep-fg-strong)] font-bold">{t("Final Total", "Total Final")}</span>
                <span className="text-[color:var(--rep-fg-strong)] text-xl font-bold">${costPlus.finalTotal.toLocaleString()}</span>
              </div>
              {!isClientView && contractorEst && (
                <div
                  className="mt-3 pt-3 border-t border-dashed border-[color:var(--rep-border)] space-y-1.5"
                  data-testid="report-contractor-rollup"
                >
                  <p className="text-[11px] uppercase tracking-widest text-[color:var(--rep-fg-faint)]">
                    {t("Contractor Estimate Rollup", "Resumen del Estimado del Contratista")}
                  </p>
                  <div className="flex justify-between text-sm text-[color:var(--rep-fg-muted)]">
                    <span>{t("Contractor Subtotal", "Subtotal Contratista")}</span>
                    <span className="text-[color:var(--rep-fg-strong)]">
                      ${(contractorEst.subtotalMaterials + contractorEst.subtotalLabor + contractorEst.subtotalSubcontractor).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-[color:var(--rep-fg-muted)]">
                    <span>{t("Contingency", "Contingencia")} ({contractorEst.contingencyPercent}%)</span>
                    <span className="text-[color:var(--rep-fg-strong)]">${contractorEst.contingency.toLocaleString()}</span>
                  </div>
                  {(contractorEst.marginPercent ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-[color:var(--rep-fg-muted)]" data-testid="report-contractor-margin">
                      <span>{t("Margin", "Margen")} ({contractorEst.marginPercent}%)</span>
                      <span className="text-[color:var(--rep-fg-strong)]">${(contractorEst.marginAmount ?? 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(contractorEst.managementFeePercent ?? 0) > 0 && (
                    <div className="flex justify-between gap-3 text-sm text-[color:var(--rep-fg-muted)]" data-testid="report-contractor-mgmt-fee">
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                        <span className="whitespace-nowrap">
                          {t("Management Fee", "Honorarios de Administración")} ({contractorEst.managementFeePercent}%)
                        </span>
                        <button
                          type="button"
                          aria-label={t("Management fee explanation", "Explicación de honorarios")}
                          title={t(
                            `Computed as ${contractorEst.managementFeePercent}% of (Materials + Labor + Subcontractor + Contingency + Margin). Edit on the Contractor tab of the calculator.`,
                            `Calculado como ${contractorEst.managementFeePercent}% de (Materiales + Mano de Obra + Subcontratistas + Contingencia + Margen). Editable en la pestaña Contratista de la calculadora.`,
                          )}
                          className="inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full border border-[color:var(--rep-border-strong)] text-[10px] font-semibold text-[color:var(--rep-fg-soft)] cursor-help leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-konti-olive focus-visible:ring-offset-1 hover:text-[color:var(--rep-fg-strong)] transition-colors"
                          data-testid="mgmt-fee-tooltip"
                        >
                          ?
                        </button>
                        <Link
                          href={`/calculator?projectId=${projectId}&tab=overview`}
                          data-testid="mgmt-fee-edit-link"
                          className="shrink-0 text-[10px] uppercase tracking-wider text-konti-olive hover:text-konti-olive/80 font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-konti-olive focus-visible:ring-offset-1 rounded"
                        >
                          {t("Edit", "Editar")} →
                        </Link>
                      </span>
                      <span className="shrink-0 text-[color:var(--rep-fg-strong)] tabular-nums">${(contractorEst.managementFeeAmount ?? 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[color:var(--rep-border)] pt-2">
                    <span className="text-[color:var(--rep-fg-strong)] font-semibold">{t("Contractor Grand Total", "Total Contratista")}</span>
                    <span className="text-[color:var(--rep-fg-strong)] font-bold">${contractorEst.grandTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Cost-by-category card — mirrors the team's PROJECT ESTIMATE
            spreadsheet by always rendering the same five canonical buckets in
            the same order, even when a bucket has no spend yet. Empty buckets
            display "—" so clients can see the structure of the report. Clients
            see this in place of the raw BOM; the team view renders it as a
            summary above the BOM detail table. */}
        <section data-testid="report-category-breakdown">
          <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
            {t("Cost by Category", "Costo por Categoría")}
          </h2>
          <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] overflow-hidden">
            <table className="w-full text-sm" data-testid="report-category-table">
              <thead className="bg-[color:var(--rep-surface-2)]">
                <tr>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-[color:var(--rep-fg-soft)]">{t("Category", "Categoría")}</th>
                  <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-[color:var(--rep-fg-soft)]">{t("Subtotal", "Subtotal")}</th>
                  <th className="text-right px-4 py-2 text-xs uppercase tracking-wider text-[color:var(--rep-fg-soft)]">{t("Share", "Participación")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--rep-border)]">
                {categoryRows.map((row) => {
                  const isEmpty = row.total <= 0;
                  const hasLines = row.lines.length > 0;
                  const isExpanded = expandedBuckets.has(row.key);
                  const toggleExpanded = () => {
                    setExpandedBuckets((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.key)) next.delete(row.key);
                      else next.add(row.key);
                      return next;
                    });
                  };
                  return (
                    <Fragment key={row.key}>
                      <tr data-testid={`report-category-row-${row.key}`} data-empty={isEmpty || undefined}>
                        <td className="px-4 py-2 text-[color:var(--rep-fg-muted)]">
                          {hasLines ? (
                            <button
                              type="button"
                              onClick={toggleExpanded}
                              data-testid={`btn-expand-bucket-${row.key}`}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded
                                ? t(`Hide details for ${row.label}`, `Ocultar detalles de ${row.label}`)
                                : t(`Show details for ${row.label}`, `Mostrar detalles de ${row.label}`)}
                              className="inline-flex items-center gap-2 text-left hover:text-[color:var(--rep-fg-strong)] transition-colors"
                            >
                              <span aria-hidden className="inline-block w-3 text-[color:var(--rep-fg-faint)]">
                                {isExpanded ? "▾" : "▸"}
                              </span>
                              <span>{row.label}</span>
                              <span className="text-[10px] uppercase tracking-wider text-[color:var(--rep-fg-faint)]">
                                · {row.lines.length}
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span aria-hidden className="inline-block w-3" />
                              <span>{row.label}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[color:var(--rep-fg-strong)]">
                          {isEmpty
                            ? <span className="text-[color:var(--rep-fg-faint)]" title={t("No charges yet", "Sin cargos")}>—</span>
                            : `$${row.total.toLocaleString()}`}
                        </td>
                        <td className="px-4 py-2 text-right text-[color:var(--rep-fg-soft)]">
                          {categoryTotal > 0 && !isEmpty ? `${Math.round((row.total / categoryTotal) * 100)}%` : "—"}
                        </td>
                      </tr>
                      {isExpanded && hasLines && row.lines.map((line) => (
                        <tr
                          key={`${row.key}-${line.category}`}
                          className="bg-[color:var(--rep-surface-2)]/40"
                          data-testid={`report-category-subline-${row.key}-${line.category}`}
                        >
                          <td className="px-4 py-1.5 pl-10 text-xs text-[color:var(--rep-fg-soft)]">
                            {line.label}
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs text-[color:var(--rep-fg-muted)]">
                            ${line.total.toLocaleString()}
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs text-[color:var(--rep-fg-faint)]">
                            {row.total > 0 ? `${Math.round((line.total / row.total) * 100)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr className="bg-konti-olive/20">
                  <td className="px-4 py-3 font-bold text-[color:var(--rep-fg-strong)]">{t("Grand Total", "Total General")}</td>
                  <td className="px-4 py-3 text-right font-bold text-konti-olive">${categoryTotal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-konti-olive">{categoryTotal > 0 ? "100%" : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Punchlist (read-only on the report). Always rendered — `PunchlistPanel`
            self-disables editing for client viewers via `isClientView`. */}
        <section data-testid="report-punchlist">
          <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
            {t("Punchlist by Phase", "Lista de Pendientes por Fase")}
          </h2>
          <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-4">
            <PunchlistPanel projectId={projectId} currentPhase={project.phase} isClientView={isClientView} />
          </div>
        </section>

        {/* Contractor monitoring narrative (delays / weather / issues / changes / breaches / rework) */}
        <ContractorMonitoringSection projectId={projectId} variant="report" />

        {/* Bill of Materials — team-only detailed line items. Clients see the
            higher-level Cost-by-Category card above instead. */}
        {!isClientView && contractorEst && contractorEst.lines.length > 0 && (
          <section data-testid="report-bill-of-materials">
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Bill of Materials", "Lista de Materiales")}
              {template ? <span className="ml-2 text-konti-olive normal-case font-normal">· {template.name}</span> : null}
            </h2>
            <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]" data-testid="report-bom-table">
                <thead className="bg-[color:var(--rep-surface-2)]">
                  <tr>
                    {(template?.columns?.length ? template.columns : DEFAULT_REPORT_COLUMNS).map((col) => (
                      <th key={col} className="text-left px-4 py-2 text-xs uppercase tracking-wider text-[color:var(--rep-fg-soft)]" data-testid={`report-bom-col-${col.replace(/\s+/g, "-").toLowerCase()}`}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--rep-border)]">
                  {contractorEst.lines.map((line) => (
                    <tr key={line.id}>
                      {(template?.columns?.length ? template.columns : DEFAULT_REPORT_COLUMNS).map((col) => (
                        <td key={col} className="px-4 py-2 text-[color:var(--rep-fg-muted)]">{reportCellForColumn(col, line, lang)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-konti-olive/20">
                    <td colSpan={(template?.columns?.length ? template.columns : DEFAULT_REPORT_COLUMNS).length - 1} className="px-4 py-3 text-right font-bold text-[color:var(--rep-fg-strong)]">
                      {t("Grand Total", "Total General")}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-konti-olive">${contractorEst.grandTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Construction milestones */}
        {milestones.length > 0 && (
          <section data-testid="report-milestones">
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Construction Milestones", "Hitos de Construcción")}
            </h2>
            <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-6 space-y-3">
              {milestones.map((m) => {
                const color = m.status === "completed" ? "bg-konti-olive" : m.status === "in_progress" ? "bg-amber-500" : "bg-[color:var(--rep-surface-2)]";
                const label = m.status === "completed" ? t("Done", "Listo") : m.status === "in_progress" ? t("In Progress", "En Progreso") : t("Upcoming", "Próximo");
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
                    <div className="flex-1 flex items-center justify-between text-sm">
                      <span className="text-[color:var(--rep-fg-strong)]">{lang === "es" ? m.titleEs : m.title}</span>
                      <span className="text-[color:var(--rep-fg-faint)] text-xs">{m.startDate} → {m.endDate} · {label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Inspections summary */}
        {inspections.length > 0 && (
          <section data-testid="report-inspections">
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Inspections", "Inspecciones")}
            </h2>
            <div className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] divide-y divide-[color:var(--rep-border)]">
              {inspections.map((insp) => {
                const statusLabels: Record<string, string> = {
                  scheduled: t("Scheduled", "Programada"),
                  passed: t("Passed", "Aprobada"),
                  failed: t("Failed", "Fallida"),
                  re_inspect: t("Re-inspect", "Re-inspección"),
                };
                const statusColor = insp.status === "passed" ? "text-emerald-500" : insp.status === "failed" ? "text-red-500" : insp.status === "re_inspect" ? "text-amber-500" : "text-sky-500";
                return (
                  <div key={insp.id} id={`inspection-${insp.id}`} className="px-5 py-3 flex items-center justify-between gap-3 text-sm scroll-mt-20">
                    <div className="min-w-0">
                      <p className="text-[color:var(--rep-fg-strong)] font-medium truncate">{lang === "es" ? insp.titleEs : insp.title}</p>
                      <p className="text-[color:var(--rep-fg-faint)] text-xs">{insp.inspector} · {insp.scheduledDate}{insp.completedDate ? ` → ${insp.completedDate}` : ""}</p>
                      {insp.reportSentToName && (
                        <p className="text-konti-olive text-xs mt-0.5">↳ {t("Report sent to", "Reporte enviado a")} {insp.reportSentToName}</p>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${statusColor} whitespace-nowrap`}>{statusLabels[insp.status]}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Weather */}
        {weather && (
          <section className="bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] p-6">
            <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4">
              {t("Weather Status", "Estado del Clima")} — {weather.city}
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-4xl sm:text-5xl font-bold text-[color:var(--rep-fg-strong)]">{weather.temperature}{weather.temperatureUnit}</p>
                <p className="text-[color:var(--rep-fg-soft)] mt-1 text-sm sm:text-base break-words">{lang === "es" ? weather.conditionEs : weather.condition} · {weather.humidity}% RH · {weather.windSpeed} {weather.windUnit}</p>
              </div>
              <div className={`self-start sm:self-auto shrink-0 px-4 py-2 rounded-xl border text-sm font-bold ${
                weather.buildSuitability === "green" ? (isLight ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-emerald-900/40 border-emerald-500/30 text-emerald-400") :
                weather.buildSuitability === "yellow" ? (isLight ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-amber-900/40 border-amber-500/30 text-amber-400") :
                (isLight ? "bg-red-100 border-red-300 text-red-800" : "bg-red-900/40 border-red-500/30 text-red-400")
              }`}>
                {lang === "es" ? weather.buildSuitabilityLabelEs : weather.buildSuitabilityLabel}
              </div>
            </div>
            <p className="text-[color:var(--rep-fg-faint)] text-xs mt-3">
              {lang === "es" ? weather.buildSuitabilityReasonEs : weather.buildSuitabilityReason}
            </p>
          </section>
        )}

        {/* Tasks */}
        <section>
          <h2 className="text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-6">
            {t("Task Summary", "Resumen de Tareas")}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--rep-fg-soft)] mb-3">{t("Completed", "Completadas")} ({completedTasks.length})</h3>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full bg-konti-olive flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[color:var(--rep-fg-soft)] line-through">{lang === "es" ? task.titleEs : task.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--rep-fg-soft)] mb-3">{t("Upcoming", "Próximas")} ({pendingTasks.length})</h3>
              <div className="space-y-2">
                {pendingTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full border border-[color:var(--rep-border-strong)] shrink-0" />
                    <span className="text-[color:var(--rep-fg-muted)]">{lang === "es" ? task.titleEs : task.title}</span>
                    {task.dueDate && <span className="text-[color:var(--rep-fg-faint)] text-xs ml-auto">{task.dueDate}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Next milestone */}
        {pendingTasks[0] && (
          <section className="bg-konti-olive/10 border border-konti-olive/30 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-konti-olive mt-0.5 shrink-0" />
              <div>
                <p className="text-konti-olive text-xs font-semibold uppercase tracking-widest mb-1">{t("Next Milestone", "Próximo Hito")}</p>
                <p className="text-[color:var(--rep-fg-strong)] font-bold text-lg">{lang === "es" ? pendingTasks[0].titleEs : pendingTasks[0].title}</p>
                {pendingTasks[0].dueDate && (
                  <p className="text-[color:var(--rep-fg-soft)] text-sm mt-1">
                    {t("Due:", "Vence:")} {pendingTasks[0].dueDate} · {pendingTasks[0].assignee}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[color:var(--rep-border)] px-12 py-6 flex items-center justify-between mt-12">
        <img src={reportLogo} alt="KONTi" className="h-10 w-auto opacity-70" />
        <p className="text-[color:var(--rep-fg-faint)] text-xs" data-testid="report-template-footer">
          {template?.footer
            ? template.footer
            : t("Powered by KONTi Design | Build Studio", "Desarrollado por KONTi Design | Build Studio") + " · " + t("Sustainable architecture for Puerto Rico", "Arquitectura sostenible para Puerto Rico")}
        </p>
      </footer>

      {/* P2.6 — Preview modal. Renders the server-generated PDF inline so
          the team can confirm the layout before exporting / sending. */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="preview-pdf-modal">
          <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" /> {t("PDF Preview", "Vista previa del PDF")}
              </h3>
              <button
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                aria-label={t("Close preview", "Cerrar vista previa")}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-close-preview"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
            <iframe
              src={previewUrl}
              title={t("PDF Preview", "Vista previa del PDF")}
              className="flex-1 w-full"
              data-testid="preview-pdf-iframe"
            />
          </div>
        </div>
      )}

      {/* P2.2 — Section visibility drawer. Team-only; toggles which sections
          appear in the client report. Per the meeting: "activar por defecto
          todos los campos del reporte para el cliente; habilitar la
          selección de campos visibles mediante toggles." */}
      {showVisibilityDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" data-testid="report-visibility-drawer">
          <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> {t("Section Visibility", "Visibilidad de Secciones")}
              </h3>
              <button
                onClick={() => setShowVisibilityDrawer(false)}
                aria-label={t("Close drawer", "Cerrar")}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-close-visibility-drawer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {t(
                "Toggle off any section you don't want the client to see in this report.",
                "Desactiva las secciones que no quieres que el cliente vea en este reporte.",
              )}
            </p>
            <ul className="space-y-2">
              {[
                ["metadata", t("Project metadata", "Datos del proyecto")],
                ["status_sentence", t("Status sentence", "Frase de estado")],
                ["phase_timeline", t("Phase timeline", "Línea de tiempo")],
                ["milestones", t("Milestones Gantt", "Hitos (Gantt)")],
                ["cost_plus_budget", t("Cost-Plus budget", "Presupuesto Cost-Plus")],
                ["variance_report", t("Variance report", "Reporte de varianza")],
                ["punchlist", t("Punchlist", "Punchlist")],
                ["site_photos", t("Site photos", "Fotos del sitio")],
                ["contractor_monitoring", t("Contractor monitoring", "Monitoreo del contratista")],
                ["documents", t("Documents", "Documentos")],
                ["client_questions", t("Client questions", "Preguntas del cliente")],
              ].map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/40">
                  <span className="text-sm">{label}</span>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSectionVisible(key)}
                      onChange={(e) => toggleSectionVisibility(key, e.target.checked)}
                      data-testid={`toggle-section-${key}`}
                      className="accent-konti-olive w-4 h-4"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectReportPage() {
  const params = useParams<{ id: string }>();

  return (
    <RequireAuth>
      <ReportContent projectId={params.id} />
    </RequireAuth>
  );
}
