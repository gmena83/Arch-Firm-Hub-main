import { useEffect, useState } from "react";
import { Settings, User, Bell, Globe, Phone, Mail, Home, Save, KeyRound, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { useUpdateMe } from "@workspace/api-client-react";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { t, lang, toggleLang } = useLang();
  const { toast } = useToast();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [postalAddress, setPostalAddress] = useState(user?.postalAddress ?? "");
  const [physicalAddress, setPhysicalAddress] = useState(user?.physicalAddress ?? "");

  // Re-sync local form fields when the persisted user changes (e.g. after re-login).
  useEffect(() => {
    setPhone(user?.phone ?? "");
    setPostalAddress(user?.postalAddress ?? "");
    setPhysicalAddress(user?.physicalAddress ?? "");
  }, [user?.phone, user?.postalAddress, user?.physicalAddress]);

  const updateMe = useUpdateMe();

  const dirty =
    phone !== (user?.phone ?? "") ||
    postalAddress !== (user?.postalAddress ?? "") ||
    physicalAddress !== (user?.physicalAddress ?? "");

  const onSave = async () => {
    try {
      const updated = await updateMe.mutateAsync({
        data: {
          phone: phone.trim(),
          postalAddress: postalAddress.trim(),
          physicalAddress: physicalAddress.trim(),
        },
      });
      updateUser({
        phone: updated.phone,
        postalAddress: updated.postalAddress,
        physicalAddress: updated.physicalAddress,
      });
      toast({
        title: t("Profile saved", "Perfil guardado"),
        description: t("Your contact info has been updated.", "Tu información de contacto fue actualizada."),
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      let descEn = "Could not save your changes. Please try again.";
      let descEs = "No se pudieron guardar tus cambios. Inténtalo de nuevo.";
      if (status === 401) {
        descEn = "Session expired. Please sign in again.";
        descEs = "Sesión expirada. Inicia sesión nuevamente.";
      }
      toast({
        title: t("Save failed", "No se pudo guardar"),
        description: t(descEn, descEs),
        variant: "destructive",
      });
    }
  };

  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    return localStorage.getItem("konti_notif_pref") !== "false";
  });

  const handleNotifToggle = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    localStorage.setItem("konti_notif_pref", next ? "true" : "false");
  };

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??";

  const roleLabel: Record<string, [string, string]> = {
    admin: ["Administrator", "Administrador"],
    superadmin: ["Super Administrator", "Super Administrador"],
    architect: ["Architect", "Arquitecto/a"],
    client: ["Client", "Cliente"],
  };

  const [en, es] = roleLabel[user?.role ?? ""] ?? [user?.role ?? "", user?.role ?? ""];

  const isSaving = updateMe.isPending;

  return (
    <RequireAuth>
      <AppLayout>
        <div className="max-w-2xl space-y-8" data-testid="settings-page">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Settings className="w-6 h-6 text-konti-olive" />
              {t("Settings", "Configuración")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("Manage your profile and preferences.", "Administra tu perfil y preferencias.")}
            </p>
          </div>

          {/* Profile card */}
          <div className="bg-card rounded-xl border border-card-border shadow-sm p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4" />
              {t("Profile", "Perfil")}
            </h2>
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-konti-olive flex items-center justify-center text-white text-xl font-bold shrink-0">
                {initials}
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-foreground">{user?.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {user?.email}
                </p>
                <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-konti-olive/15 text-konti-olive font-medium">
                  {t(en, es)}
                </span>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                {t(
                  "Update the contact information your project team uses to reach you.",
                  "Actualiza la información de contacto que el equipo del proyecto utiliza para comunicarse contigo.",
                )}
              </p>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {t("Phone", "Teléfono")}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="settings-input-phone"
                  placeholder="+1 787-555-0000"
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {t("Postal Address", "Dirección Postal")}
                </label>
                <input
                  type="text"
                  value={postalAddress}
                  onChange={(e) => setPostalAddress(e.target.value)}
                  data-testid="settings-input-postal-address"
                  placeholder={t("PO Box, City, ZIP", "Apartado, Ciudad, ZIP")}
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5" />
                  {t("Physical Address", "Dirección Física")}
                </label>
                <input
                  type="text"
                  value={physicalAddress}
                  onChange={(e) => setPhysicalAddress(e.target.value)}
                  data-testid="settings-input-physical-address"
                  placeholder={t("Street, City, ZIP", "Calle, Ciudad, ZIP")}
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!dirty || isSaving}
                  data-testid="settings-btn-save"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-konti-olive text-white text-sm font-semibold hover:bg-konti-olive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? t("Saving…", "Guardando…") : t("Save Changes", "Guardar Cambios")}
                </button>
              </div>
            </div>
          </div>

          {/* Preferences card */}
          <div className="bg-card rounded-xl border border-card-border shadow-sm p-6 space-y-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {t("Preferences", "Preferencias")}
            </h2>

            {/* Language toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t("Language", "Idioma")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("Switch between English and Spanish.", "Cambia entre inglés y español.")}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleLang}
                data-testid="settings-lang-toggle"
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-input bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
              >
                <span className={lang === "en" ? "text-konti-olive" : "text-muted-foreground"}>EN</span>
                <span className="text-muted-foreground mx-1">|</span>
                <span className={lang === "es" ? "text-konti-olive" : "text-muted-foreground"}>ES</span>
              </button>
            </div>

            <div className="border-t border-border" />

            {/* Integrations live on the dedicated /integrations page (Task
                #130). Settings no longer mounts the Asana / Drive panels.
                Superadmins see a quick link below; non-superadmins simply
                don't see this section. */}
            {user?.role === "superadmin" && (
              <>
                <Link
                  href="/integrations"
                  data-testid="link-integrations"
                  className="flex items-center justify-between gap-3 rounded-lg border border-card-border bg-muted/30 hover:bg-muted/60 px-4 py-3 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <KeyRound className="w-5 h-5 text-konti-olive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("Integrations", "Integraciones")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          "Manage API keys, restart Drive/Asana, and view audit log.",
                          "Administra llaves API, reinicia Drive/Asana y consulta el registro.",
                        )}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
                <div className="border-t border-border" />
              </>
            )}

            {/* Notification preference */}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Notifications", "Notificaciones")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "Receive project activity notifications in the sidebar.",
                      "Recibe notificaciones de actividad de proyectos en la barra lateral.",
                    )}
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={notifEnabled}
                onClick={handleNotifToggle}
                data-testid="settings-notif-toggle"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-konti-olive/50 ${
                  notifEnabled ? "bg-konti-olive" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    notifEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
