import { useState, useRef, useEffect, useMemo } from "react";
import { useListProjects, useSendChatMessage } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { Send, Trash2, Bot, User, Loader2, MessageSquare, Briefcase, Mic, MicOff, NotebookPen, Check, X, BarChart3, Printer } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

type ChatMode = "client_assistant" | "internal_spec_bot";

interface ProposedAction { action: string; summary: string; summaryEs?: string; items: string[] }
interface Message { role: "user" | "assistant"; content: string; proposed?: ProposedAction | null; }

const PROPOSED_RE = /\[PROPOSED_ACTION\](\{[\s\S]*?\})\[\/PROPOSED_ACTION\]/;

function extractProposed(text: string): { content: string; proposed: ProposedAction | null } {
  const m = PROPOSED_RE.exec(text);
  if (!m) return { content: text, proposed: null };
  try {
    const obj = JSON.parse(m[1]) as ProposedAction;
    if (!Array.isArray(obj.items)) return { content: text, proposed: null };
    return { content: text.replace(PROPOSED_RE, "").trim(), proposed: obj };
  } catch {
    return { content: text, proposed: null };
  }
}

function authHeader(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem("konti_auth");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch { return {}; }
}

// Web Speech API typing.
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: (e: { results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number } }) => void;
  onerror: (e: unknown) => void; onend: () => void;
  start: () => void; stop: () => void;
};
type SRConstructor = new () => SpeechRecognitionLike;
function getSpeechRecognition(): SRConstructor | null {
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function ConfirmActionCard({ proposed, projectId, onDone }: { proposed: ProposedAction; projectId: string; onDone: (result: string) => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const summary = lang === "es" && proposed.summaryEs ? proposed.summaryEs : proposed.summary;

  const confirm = async () => {
    setBusy("confirm");
    try {
      const r = await fetch("/api/ai/confirm-classification", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ projectId: projectId || "proj-1", action: proposed.action, items: proposed.items }),
      });
      if (!r.ok) {
        toast({ title: t("Action failed", "Falló la acción"), description: t(`Server returned ${r.status}.`, `El servidor devolvió ${r.status}.`), variant: "destructive" });
        setBusy(null);
        return;
      }
      const data = (await r.json()) as { classified?: number };
      onDone(t(`Confirmed — ${data.classified ?? proposed.items.length} item(s) classified.`, `Confirmado — ${data.classified ?? proposed.items.length} elemento(s) clasificado(s).`));
    } catch {
      toast({ title: t("Action failed", "Falló la acción"), variant: "destructive" });
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 border-2 border-konti-olive/50 bg-konti-olive/5 rounded-lg p-3" data-testid="confirm-card">
      <div className="flex items-center gap-2 mb-2">
        <Check className="w-4 h-4 text-konti-olive" />
        <p className="text-xs font-bold uppercase tracking-wide text-konti-olive">{t("Confirmation required", "Confirmación requerida")}</p>
      </div>
      <p className="text-sm text-foreground mb-2">{summary}</p>
      <ul className="text-xs text-muted-foreground list-disc pl-5 mb-3 space-y-0.5">
        {proposed.items.slice(0, 8).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
      <div className="flex items-center gap-2">
        <button onClick={confirm} disabled={busy !== null} data-testid="btn-confirm-action" className="inline-flex items-center gap-1 px-3 py-1.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-xs font-semibold rounded-md disabled:opacity-50">
          {busy === "confirm" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {t("Confirm", "Confirmar")}
        </button>
        <button onClick={() => onDone(t("Cancelled.", "Cancelado."))} disabled={busy !== null} data-testid="btn-cancel-action" className="inline-flex items-center gap-1 px-3 py-1.5 border border-border text-xs font-semibold rounded-md hover:bg-muted">
          <X className="w-3 h-3" />
          {t("Cancel", "Cancelar")}
        </button>
      </div>
    </div>
  );
}

function VoiceButton({ onTranscript, lang }: { onTranscript: (text: string) => void; lang: "en" | "es" }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const SR = useMemo(getSpeechRecognition, []);

  const start = () => {
    if (!SR) {
      toast({ title: t("Voice input not supported in this browser", "La entrada de voz no es compatible con este navegador"), variant: "destructive" });
      return;
    }
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = lang === "es" ? "es-PR" : "en-US";
    r.onresult = (e) => {
      const text = Array.from({ length: e.results.length }).map((_, i) => e.results[i]?.[0]?.transcript ?? "").join(" ").trim();
      if (text) onTranscript(text);
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    recRef.current = r;
    setRecording(true);
    r.start();
  };
  const stop = () => { recRef.current?.stop(); setRecording(false); };

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      data-testid="btn-mic"
      title={t("Voice input", "Entrada de voz")}
      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors border ${recording ? "bg-red-500 border-red-500 text-white animate-pulse" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
    >
      {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}

function SpecUpdatesReport({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [data, setData] = useState<{ totals: { added: number; opened: number; resolved: number }; addedByWeek: { week: string; count: number }[]; openVsResolved: { status: string; count: number }[]; recent: { title: string; kind: string; createdAt: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/spec-updates-report`, { headers: authHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [projectId]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/spec-updates-report/pdf`, { method: "POST", headers: authHeader() });
      if (!r.ok) {
        if (r.status === 501) {
          toast({ title: t("PDF export not configured", "Exportación PDF no configurada"), description: t("Falling back to print view.", "Usando vista de impresión."), variant: "destructive" });
          window.print();
          return;
        }
        throw new Error(`http_${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `KONTi-Spec-Report-${projectName.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: t("PDF downloaded", "PDF descargado") });
    } catch {
      toast({ title: t("PDF export failed", "Falló la exportación PDF"), variant: "destructive" });
    } finally { setExporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose} data-testid="spec-report-modal">
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:rounded-none">
        <div className="flex items-center justify-between p-5 border-b border-border print:hidden">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-konti-olive" />{t("Spec Updates Report", "Reporte de Actualizaciones de Especificaciones")}</h3>
            <p className="text-xs text-muted-foreground">{projectName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} disabled={exporting} data-testid="btn-print-report" className="inline-flex items-center gap-1 px-3 py-1.5 bg-konti-olive text-white text-xs font-semibold rounded-md hover:bg-konti-olive/90 disabled:opacity-60">
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
              {t("Export PDF", "Exportar PDF")}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-md"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {loading && <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}

        {data && !loading && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t("Specs added", "Specs agregadas")}</p><p className="text-2xl font-bold text-konti-olive">{data.totals.added}</p></div>
              <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t("Open questions", "Preguntas abiertas")}</p><p className="text-2xl font-bold text-foreground">{Math.max(data.totals.opened - data.totals.resolved, 0)}</p></div>
              <div className="bg-muted/40 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t("Resolved", "Resueltas")}</p><p className="text-2xl font-bold text-foreground">{data.totals.resolved}</p></div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">{t("Specs added per week", "Specs agregadas por semana")}</h4>
              <div className="h-56 bg-card border border-border rounded-lg p-2" data-testid="chart-added-by-week">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.addedByWeek}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4F5E2A" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">{t("Open vs resolved questions", "Preguntas abiertas vs resueltas")}</h4>
              <div className="h-56 bg-card border border-border rounded-lg p-2" data-testid="chart-open-vs-resolved">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.openVsResolved} dataKey="count" nameKey="status" outerRadius={70} label>
                      {data.openVsResolved.map((entry, i) => <Cell key={i} fill={entry.status === "Open" ? "#778894" : "#4F5E2A"} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">{t("Recent activity", "Actividad reciente")}</h4>
              <ul className="text-xs space-y-1.5 bg-muted/30 rounded-lg p-3">
                {data.recent.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground w-16 shrink-0">{e.kind}</span>
                    <span className="flex-1 truncate">{e.title}</span>
                    <span className="text-muted-foreground tabular-nums">{new Date(e.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatInterface({ mode, projectId }: { mode: ChatMode; projectId: string }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mutation = useSendChatMessage();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  const send = () => {
    if (!input.trim() || mutation.isPending) return;
    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const sentText = input;
    setInput("");

    mutation.mutate(
      { data: { message: sentText, mode, projectId: projectId || undefined, conversationHistory: messages.map(({ role, content }) => ({ role, content })) } },
      {
        onSuccess: (data) => {
          const { content, proposed } = extractProposed(data.message);
          setMessages((prev) => [...prev, { role: "assistant", content, proposed }]);
        },
        onError: () => {
          setMessages((prev) => [...prev, { role: "assistant", content: t("I'm having trouble connecting. Please try again.", "Tengo problemas para conectarme. Por favor intente de nuevo.") }]);
        },
      }
    );
  };

  const saveAsNote = async () => {
    if (!input.trim()) return;
    if (!projectId) { toast({ title: t("Pick a project to save the note", "Selecciona un proyecto para guardar la nota"), variant: "destructive" }); return; }
    setSavingNote(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ text: input, type: "voice_note", lang, source: "voice_input" }),
      });
      if (!r.ok) throw new Error("save_failed");
      toast({ title: t("Note saved", "Nota guardada"), description: t("Attached to project notes.", "Adjunta a las notas del proyecto.") });
      setInput("");
    } catch { toast({ title: t("Could not save note", "No se pudo guardar la nota"), variant: "destructive" }); }
    finally { setSavingNote(false); }
  };

  const finalizeProposed = (idx: number, resultText: string) => {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, proposed: null, content: m.content + "\n\n_" + resultText + "_" } : m));
  };

  const isClient = mode === "client_assistant";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" data-testid={`chat-messages-${mode}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-full bg-konti-olive/10 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-konti-olive" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">
              {isClient ? t("Welcome to KONTi Client Assistant", "Bienvenido al Asistente KONTi") : t("KONTi Internal Spec Bot", "Bot de Especificaciones Internas KONTi")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {isClient ? t("Ask me about your project progress, timelines, and next steps.", "Pregúntame sobre el progreso de tu proyecto, plazos y próximos pasos.") : t("Ask me about specifications, documents, material quantities, permit requirements.", "Pregúntame sobre especificaciones, documentos, cantidades de materiales, requisitos de permisos.")}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`} data-testid={`chat-msg-${i}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-konti-slate text-white" : "bg-konti-olive text-white"}`}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-xs md:max-w-2xl rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-konti-olive text-white rounded-tr-sm" : "bg-card border border-card-border text-foreground rounded-tl-sm"}`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-konti-olive" data-testid={`md-${i}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
              {msg.proposed && (
                <ConfirmActionCard proposed={msg.proposed} projectId={projectId} onDone={(r) => finalizeProposed(i, r)} />
              )}
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex gap-3" data-testid="typing-indicator">
            <div className="w-8 h-8 rounded-full bg-konti-olive flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-white" /></div>
            <div className="bg-card border border-card-border rounded-2xl rounded-tl-sm px-4 py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-end">
          <VoiceButton onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)} lang={lang as "en" | "es"} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={isClient ? t("Ask about your project, or hold mic to dictate...", "Pregunta sobre tu proyecto, o usa el micrófono para dictar...") : t("Ask about specs, materials, permits...", "Pregunta sobre especificaciones, materiales, permisos...")}
            data-testid={`chat-input-${mode}`}
            className="flex-1 px-4 py-2.5 rounded-full border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button onClick={saveAsNote} disabled={!input.trim() || savingNote || !projectId} data-testid="btn-save-note" title={t("Save as project note", "Guardar como nota del proyecto")} className="w-10 h-10 rounded-full bg-card border border-border text-muted-foreground hover:bg-muted flex items-center justify-center shrink-0 disabled:opacity-40">
            {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <NotebookPen className="w-4 h-4" />}
          </button>
          <button onClick={send} disabled={!input.trim() || mutation.isPending} data-testid={`btn-send-${mode}`} className="w-10 h-10 rounded-full bg-konti-olive hover:bg-konti-olive/90 text-white flex items-center justify-center transition-colors disabled:opacity-40 shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const { t } = useLang();
  const { data: projects = [] } = useListProjects();
  const [activeMode, setActiveMode] = useState<ChatMode>("client_assistant");
  const [projectId, setProjectId] = useState("");
  const [keys, setKeys] = useState({ client_assistant: 0, internal_spec_bot: 0 });
  const [showReport, setShowReport] = useState(false);

  const clearChat = () => setKeys((prev) => ({ ...prev, [activeMode]: prev[activeMode] + 1 }));
  const activeProjectName = projects.find((p) => p.id === projectId)?.name ?? "";
  const reportProjectId = projectId || projects[0]?.id || "";

  return (
    <RequireAuth>
      <AppLayout>
        <div className="space-y-4 h-full" data-testid="ai-assistant-page">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("AI Assistant", "Asistente IA")}</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {t("Powered by Claude — KONTi's architecture intelligence.", "Desarrollado por Claude — inteligencia arquitectónica de KONTi.")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="ai-project-selector" className="px-3 py-2 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">{t("All Projects", "Todos los Proyectos")}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={clearChat} data-testid="btn-clear-chat" className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                <Trash2 className="w-4 h-4" /> {t("Clear", "Limpiar")}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit" data-testid="mode-tabs">
              <button onClick={() => setActiveMode("client_assistant")} data-testid="tab-client-assistant" className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeMode === "client_assistant" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <MessageSquare className="w-3.5 h-3.5" />
                {t("Client Assistant", "Asistente del Cliente")}
              </button>
              <button
                onClick={() => setActiveMode("internal_spec_bot")}
                data-testid="tab-spec-bot"
                title={t(
                  "Internal spec bot — ask about specs, documents, tasks, and change orders for the selected project.",
                  "Bot interno de especificaciones — pregunta sobre especificaciones, documentos, tareas y órdenes de cambio del proyecto seleccionado."
                )}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeMode === "internal_spec_bot" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                {t("Internal Spec Bot", "Bot de Especificaciones")}
              </button>
            </div>
            {activeMode === "internal_spec_bot" && (
              <button onClick={() => setShowReport(true)} disabled={!reportProjectId} data-testid="btn-open-spec-report" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-konti-olive text-white text-sm font-semibold hover:bg-konti-olive/90 disabled:opacity-50">
                <BarChart3 className="w-4 h-4" />{t("Updates Report", "Reporte de Actualizaciones")}
              </button>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden h-[calc(100dvh-360px)] md:h-[calc(100vh-280px)] min-h-[400px]">
            {activeMode === "client_assistant" ? (
              <ChatInterface key={`client-${keys.client_assistant}`} mode="client_assistant" projectId={projectId} />
            ) : (
              <ChatInterface key={`spec-${keys.internal_spec_bot}`} mode="internal_spec_bot" projectId={projectId} />
            )}
          </div>

          {showReport && reportProjectId && (
            <SpecUpdatesReport projectId={reportProjectId} projectName={activeProjectName || t("All Projects", "Todos los Proyectos")} onClose={() => setShowReport(false)} />
          )}
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
