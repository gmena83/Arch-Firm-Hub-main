import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderOpen, Calculator, Package, MessageSquare, LogOut, Menu, X, Users, FileCheck, Settings, Inbox, ShieldCheck, KeyRound, BookOpen } from "lucide-react";
import { useState } from "react";
import { useListLeads } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { NotificationBell } from "./notification-bell";
import logoWhite from "@assets/Horizontal02_WhitePNG_1776258303461.png";
import menatechLogo from "@assets/menatech}_1776274281761.png";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  labelEs: string;
  clientVisible: boolean;
  adminOnly?: boolean;
  superadminOnly?: boolean;
  fieldAdminOnly?: boolean;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", labelEs: "Panel", clientVisible: true },
  { href: "/projects", icon: FolderOpen, label: "Projects", labelEs: "Proyectos", clientVisible: true },
  { href: "/calculator", icon: Calculator, label: "Calculator", labelEs: "Calculadora", clientVisible: false },
  { href: "/materials", icon: Package, label: "Materials", labelEs: "Materiales", clientVisible: false },
  { href: "/ai", icon: MessageSquare, label: "AI Assistant", labelEs: "Asistente IA", clientVisible: true },
  { href: "/team", icon: Users, label: "Team", labelEs: "Equipo", clientVisible: false },
  { href: "/permits", icon: FileCheck, label: "Permits", labelEs: "Permisos", clientVisible: false },
  { href: "/leads", icon: Inbox, label: "Leads", labelEs: "Leads", clientVisible: false },
  { href: "/audit", icon: ShieldCheck, label: "Audit Log", labelEs: "Auditoría", clientVisible: false, adminOnly: true },
  { href: "/field-admin", icon: ShieldCheck, label: "Field Admin", labelEs: "Admin. Operativa", clientVisible: false, fieldAdminOnly: true },
  { href: "/integrations", icon: KeyRound, label: "Integrations", labelEs: "Integraciones", clientVisible: false, superadminOnly: true },
  { href: "/help", icon: BookOpen, label: "Help", labelEs: "Ayuda", clientVisible: true },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { t, lang, toggleLang } = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isClient = user?.role === "client";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperadmin = user?.role === "superadmin";
  // P4.3 — field_admin sees the field-admin page; admin + superadmin see it too.
  const isFieldAdmin = user?.role === "field_admin" || isAdmin;
  const showNotifications = true;
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (isClient && !item.clientVisible) return false;
    if (item.superadminOnly && !isSuperadmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.fieldAdminOnly && !isFieldAdmin) return false;
    return true;
  });

  const { data: leads = [] } = useListLeads({
    query: {
      enabled: !isClient,
      queryKey: ["/api/leads"],
    },
  });
  const newLeadsCount = isClient ? 0 : leads.filter((l) => l.status === "new").length;

  const LangToggle = ({ testId = "lang-toggle" }: { testId?: string }) => (
    <button
      onClick={toggleLang}
      data-testid={testId}
      className="flex items-center gap-1.5 font-semibold transition-colors text-white/80 hover:text-white px-1.5 py-1 rounded text-xs"
      title={lang === "en" ? "Switch to Spanish" : "Cambiar a inglés"}
    >
      <span className={lang === "en" ? "text-white font-bold" : "opacity-50"}>EN</span>
      <span className="opacity-30">|</span>
      <span className={lang === "es" ? "text-white font-bold" : "opacity-50"}>ES</span>
    </button>
  );

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-sidebar-border flex flex-col gap-3">
        <img src={logoWhite} alt="KONTi" className="h-12 w-auto max-w-[12rem] object-contain" />
        <div className="flex items-center justify-end gap-1">
          {showNotifications && <NotificationBell />}
          <LangToggle testId="lang-toggle-sidebar" />
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" data-testid="sidebar-nav">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          const label = isClient && item.href === "/projects"
            ? t("My Project", "Mi Proyecto")
            : t(item.label, item.labelEs);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              data-testid={`nav-${item.href.replace("/", "")}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-konti-olive text-white"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {item.href === "/leads" && newLeadsCount > 0 && (
                <span
                  data-testid="leads-badge"
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/25 text-white" : "bg-konti-olive text-white"
                  }`}
                >
                  {newLeadsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-konti-olive flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.avatar ?? user?.name?.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            data-testid="nav-settings"
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
            title={t("Settings", "Configuración")}
          >
            <Settings className="w-4 h-4" />
          </Link>
          <button
            onClick={logout}
            data-testid="btn-logout"
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
            title={t("Logout", "Cerrar sesión")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <a
          href="https://menatech.cloud"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1 px-3 py-1 opacity-40 hover:opacity-70 transition-opacity"
          data-testid="menatech-attribution-sidebar"
        >
          <img src={menatechLogo} alt="Menatech" className="h-3 w-3 object-contain rounded" />
          <span className="text-sidebar-foreground/60 text-[10px]">{t("Powered by", "Desarrollado por")}</span>
          <span className="text-sidebar-foreground/80 text-[10px] font-medium">menatech</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground shrink-0 h-screen sticky top-0">
        <NavContent />
      </aside>

      {/* Mobile header (two-row to mirror desktop) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar text-sidebar-foreground px-3 py-2 flex flex-col gap-2 overflow-visible">
        <div className="flex items-center justify-between gap-2">
          <img src={logoWhite} alt="KONTi" className="h-12 w-auto max-w-[12rem] object-contain min-w-0" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="mobile-menu-toggle"
            aria-label={mobileOpen ? t("Close menu", "Cerrar menú") : t("Open menu", "Abrir menú")}
            aria-expanded={mobileOpen}
            className="shrink-0"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        <div className="flex items-center justify-end gap-1">
          {showNotifications && <NotificationBell />}
          <LangToggle testId="lang-toggle-mobile" />
        </div>
      </div>

      {/* Mobile slide-out menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-sidebar text-sidebar-foreground h-full pt-24">
            <NavContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
