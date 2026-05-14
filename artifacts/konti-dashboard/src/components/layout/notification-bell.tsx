import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { Bell, Upload, CheckSquare, ArrowRight, CloudRain, MessageSquare, HelpCircle, X } from "lucide-react";
import { useLang } from "@/hooks/use-lang";

type ActivityType =
  | "document_upload"
  | "task_completed"
  | "phase_change"
  | "weather_alert"
  | "comment"
  | "client_question";

interface NotificationItem {
  id: string;
  type: ActivityType;
  projectId: string;
  projectName: string;
  description: string;
  descriptionEs: string;
  actor: string;
  timestamp: string;
  seen: boolean;
}

const ICON_MAP: Record<ActivityType, React.ReactNode> = {
  document_upload: <Upload className="w-3.5 h-3.5" />,
  task_completed: <CheckSquare className="w-3.5 h-3.5" />,
  phase_change: <ArrowRight className="w-3.5 h-3.5" />,
  weather_alert: <CloudRain className="w-3.5 h-3.5" />,
  comment: <MessageSquare className="w-3.5 h-3.5" />,
  client_question: <HelpCircle className="w-3.5 h-3.5" />,
};

const COLOR_MAP: Record<ActivityType, string> = {
  document_upload: "bg-sky-100 text-sky-600",
  task_completed: "bg-green-100 text-green-600",
  phase_change: "bg-konti-olive/15 text-konti-olive",
  weather_alert: "bg-amber-100 text-amber-600",
  comment: "bg-purple-100 text-purple-600",
  client_question: "bg-konti-olive/15 text-konti-olive",
};

function formatRelativeTime(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "es" ? "ahora" : "now";
  if (mins < 60) return lang === "es" ? `hace ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "es" ? `hace ${hrs}h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === "es" ? `hace ${days}d` : `${days}d ago`;
}

function authHeader(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem("konti_auth");
    if (!raw) return {};
    const tok = (JSON.parse(raw) as { token?: string }).token;
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch { return {}; }
}

export function NotificationBell() {
  const { t, lang } = useLang();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 352 });

  const load = useCallback(() => {
    fetch(`/api/notifications`, { headers: authHeader() })
      .then((r) => r.ok ? r.json() : { items: [], unread: 0 })
      .then((d: { items?: NotificationItem[]; unread?: number }) => {
        setItems(d.items ?? []);
        setUnread(d.unread ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inButton = buttonRef.current?.contains(target);
      if (!inPanel && !inButton) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const computePanelPos = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 8;
    const desiredWidth = 352;
    const width = Math.min(desiredWidth, vw - margin * 2);
    // Anchor right edge of panel to right edge of bell, then clamp into viewport
    let left = rect.right - width;
    if (left < margin) left = margin;
    if (left + width > vw - margin) left = vw - margin - width;
    const top = rect.bottom + 8;
    setPanelPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePanelPos();
    const onResize = () => computePanelPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, computePanelPos]);

  const markSeen = async (id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, seen: true } : it));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch(`/api/notifications/${id}/seen`, { method: "POST", headers: authHeader() });
    } catch { /* best effort */ }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((it) => ({ ...it, seen: true })));
    setUnread(0);
    try {
      await fetch(`/api/notifications/seen-all`, { method: "POST", headers: authHeader() });
    } catch { /* best effort */ }
  };

  const handleClick = (item: NotificationItem) => {
    if (!item.seen) void markSeen(item.id);
    setOpen(false);
    setLocation(`/projects/${item.projectId}`);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="notification-bell"
        aria-label={t("Notifications", "Notificaciones")}
        className="relative flex items-center justify-center w-7 h-7 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        title={t("Notifications", "Notificaciones")}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          data-testid="notification-panel"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelPos.width }}
          className="bg-card border border-card-border rounded-xl shadow-xl z-[60] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{t("Notifications", "Notificaciones")}</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  data-testid="mark-all-read"
                  className="text-xs text-konti-olive hover:text-konti-olive/80 font-medium transition-colors"
                >
                  {t("Mark all read", "Marcar todo leído")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("Close", "Cerrar")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("No notifications.", "Sin notificaciones.")}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClick(item)}
                  data-testid={`notification-item-${item.id}`}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${item.seen ? "" : "bg-konti-olive/5"}`}
                >
                  <span className={`mt-0.5 p-1.5 rounded-full shrink-0 ${COLOR_MAP[item.type]}`}>
                    {ICON_MAP[item.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${item.seen ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                      {lang === "es" ? item.descriptionEs : item.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {item.projectName} · {formatRelativeTime(item.timestamp, lang)}
                    </p>
                  </div>
                  {!item.seen && <span className="mt-1.5 w-2 h-2 rounded-full bg-konti-olive shrink-0" aria-hidden="true" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
