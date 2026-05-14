import { useState } from "react";
import { Link } from "wouter";
import { useCreateLead } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import {
  Globe, Instagram, Users, Newspaper, Calendar,
  Building2, Home, Layers, Container,
  MapPin, DollarSign, Mountain, FileSignature,
  CheckCircle2, ArrowRight, ArrowLeft, CalendarDays, Video,
} from "lucide-react";
import logoWhite from "@assets/Horizontal02_WhitePNG_1776258303461.png";

type Step = 1 | 2 | 3 | 4 | 5;

const SOURCES = [
  { value: "website", label: "Website", labelEs: "Sitio web", icon: Globe },
  { value: "social", label: "Social Media", labelEs: "Redes sociales", icon: Instagram },
  { value: "referral", label: "Referral", labelEs: "Referencia", icon: Users },
  { value: "media", label: "Media / Press", labelEs: "Medios / Prensa", icon: Newspaper },
  { value: "events", label: "Events", labelEs: "Eventos", icon: Calendar },
] as const;

const TYPES = [
  { value: "residencial", label: "Residential", labelEs: "Residencial", icon: Home },
  { value: "comercial", label: "Commercial", labelEs: "Comercial", icon: Building2 },
  { value: "mixto", label: "Mixed-use", labelEs: "Mixto", icon: Layers },
  { value: "contenedor", label: "Container", labelEs: "Contenedor", icon: Container },
] as const;

const BUDGETS = [
  { value: "under_150k", label: "Under $150K", labelEs: "Menos de $150K" },
  { value: "150k_300k", label: "$150K – $300K", labelEs: "$150K – $300K" },
  { value: "300k_500k", label: "$300K – $500K", labelEs: "$300K – $500K" },
  { value: "500k_1m", label: "$500K – $1M", labelEs: "$500K – $1M" },
  { value: "over_1m", label: "Over $1M", labelEs: "Más de $1M" },
] as const;

const TERRAINS = [
  { value: "no_terrain", label: "No land yet", labelEs: "Sin terreno" },
  { value: "with_terrain", label: "I have land", labelEs: "Con terreno" },
  { value: "with_plans", label: "Land + plans", labelEs: "Con terreno y planos" },
] as const;

function nextBusinessDays(count: number, perDay: number): { date: Date; slot: string }[] {
  const result: { date: Date; slot: string }[] = [];
  const times = ["10:00", "13:00", "15:30"];
  let d = new Date();
  d.setDate(d.getDate() + 1);
  while (result.length < count * perDay) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      for (let i = 0; i < perDay; i++) {
        const slot = times[i % times.length] ?? "10:00";
        result.push({ date: new Date(d), slot });
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return result.slice(0, count * perDay);
}

function nextSaturdays(count: number): Date[] {
  const result: Date[] = [];
  const d = new Date();
  while (result.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) result.push(new Date(d));
  }
  return result;
}

export default function IntakePage() {
  const { t, lang, toggleLang } = useLang();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({
    source: "" as "" | (typeof SOURCES)[number]["value"],
    projectType: "" as "" | (typeof TYPES)[number]["value"],
    location: "",
    budgetRange: "" as "" | (typeof BUDGETS)[number]["value"],
    terrainStatus: "" as "" | (typeof TERRAINS)[number]["value"],
    contactName: "",
    email: "",
    phone: "",
    notes: "",
  });
  // C-1: honeypot — a real user never sees this field (positioned off-screen
  // + tab-index disabled + aria-hidden + autocomplete off). Bots that scrape
  // the DOM and submit every input WILL fill it. If it has a value at submit
  // time, we silently drop the submission client-side; the server-side guard
  // in routes/leads.ts catches direct-POST bots that bypass this React form.
  const [companyUrl, setCompanyUrl] = useState("");
  const [bookingTab, setBookingTab] = useState<"consultation_30min" | "weekly_seminar">("consultation_30min");
  const [selectedSlot, setSelectedSlot] = useState<{ slot: string; label: string } | null>(null);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);

  const createLead = useCreateLead({
    mutation: {
      onSuccess: (lead) => {
        setCreatedLeadId(lead.id);
        setStep(5);
      },
    },
  });

  const consultationSlots = nextBusinessDays(5, 3);
  const seminarDates = nextSaturdays(4);

  const submitLead = (booking?: { type: "consultation_30min" | "weekly_seminar"; slot: string; label: string }) => {
    if (!form.source || !form.projectType || !form.budgetRange || !form.terrainStatus) return;
    // C-1: client-side honeypot drop. If a DOM-scraping bot filled the hidden
    // field, fake success in the UI (advance to step 5) without ever calling
    // the API. No team notification, no Asana task, no cost.
    if (companyUrl.trim() !== "") {
      setCreatedLeadId("lead-dropped-honeypot");
      setStep(5);
      return;
    }
    createLead.mutate({
      data: {
        source: form.source,
        projectType: form.projectType,
        location: form.location,
        budgetRange: form.budgetRange,
        terrainStatus: form.terrainStatus,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        notes: form.notes || undefined,
        booking,
      },
    });
  };

  const canStep2 = !!form.source;
  const canStep3 = !!form.projectType && !!form.location && !!form.budgetRange && !!form.terrainStatus;
  const canStep4 = !!form.contactName && !!form.email && !!form.phone;

  return (
    <div className="min-h-screen bg-konti-dark text-konti-light flex flex-col" data-testid="intake-page">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-white/10">
        <Link href="/login" className="flex items-center gap-2">
          <img src={logoWhite} alt="KONTi" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleLang}
            data-testid="lang-toggle-intake"
            className="text-xs font-semibold text-white/70 hover:text-white"
          >
            {lang === "en" ? "ES" : "EN"}
          </button>
          <Link href="/login" className="text-xs text-white/70 hover:text-white">
            {t("Team Login →", "Acceso Equipo →")}
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* C-1 honeypot — invisible to humans, irresistible to DOM-scraping bots. */}
        <input
          type="text"
          name="company_url"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={companyUrl}
          onChange={(e) => setCompanyUrl(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          data-testid="intake-honeypot"
        />
        {/* Progress dots */}
        {step < 5 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1.5 rounded-full transition-all ${
                  n === step ? "w-8 bg-konti-olive" : n < step ? "w-4 bg-konti-olive/60" : "w-4 bg-white/15"
                }`}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8" data-testid="intake-step-source">
            <div>
              <h1 className="font-display text-4xl font-bold mb-3 text-konti-light">
                {t("Let's build something together.", "Construyamos algo juntos.")}
              </h1>
              <p className="text-white/60">
                {t("How did you hear about KONTi?", "¿Cómo conociste a KONTi?")}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                const selected = form.source === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setForm({ ...form, source: s.value })}
                    data-testid={`source-${s.value}`}
                    className={`p-5 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      selected
                        ? "border-konti-olive bg-konti-olive/15"
                        : "border-white/10 hover:border-white/30 bg-white/5"
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                    <span className="text-sm font-medium">{t(s.label, s.labelEs)}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!canStep2}
                data-testid="btn-next-step1"
                className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold disabled:opacity-40"
              >
                {t("Continue", "Continuar")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6" data-testid="intake-step-project">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2 text-konti-light">
                {t("Tell us about your project", "Cuéntanos sobre tu proyecto")}
              </h1>
              <p className="text-white/60 text-sm">
                {t("We'll use this to prepare your initial consultation.", "Lo usaremos para preparar tu consulta inicial.")}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">
                {t("Project type", "Tipo de proyecto")}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TYPES.map((tp) => {
                  const Icon = tp.icon;
                  const selected = form.projectType === tp.value;
                  return (
                    <button
                      key={tp.value}
                      onClick={() => setForm({ ...form, projectType: tp.value })}
                      data-testid={`type-${tp.value}`}
                      className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1.5 ${
                        selected ? "border-konti-olive bg-konti-olive/15" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{t(tp.label, tp.labelEs)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-white/80 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> {t("Location", "Ubicación")}
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                data-testid="input-location"
                placeholder={t("e.g., Rincón, Puerto Rico", "ej., Rincón, Puerto Rico")}
                className="w-full px-3 py-2.5 rounded-md bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/50"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white/80 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" /> {t("Budget range", "Rango de presupuesto")}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {BUDGETS.map((b) => {
                  const selected = form.budgetRange === b.value;
                  return (
                    <button
                      key={b.value}
                      onClick={() => setForm({ ...form, budgetRange: b.value })}
                      data-testid={`budget-${b.value}`}
                      className={`px-2 py-2 rounded-lg border-2 text-xs font-medium ${
                        selected ? "border-konti-olive bg-konti-olive/15" : "border-white/10 bg-white/5"
                      }`}
                    >
                      {t(b.label, b.labelEs)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-white/80 mb-1.5 flex items-center gap-1.5">
                <Mountain className="w-4 h-4" /> {t("Land status", "Estado del terreno")}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TERRAINS.map((tr) => {
                  const selected = form.terrainStatus === tr.value;
                  return (
                    <button
                      key={tr.value}
                      onClick={() => setForm({ ...form, terrainStatus: tr.value })}
                      data-testid={`terrain-${tr.value}`}
                      className={`px-2 py-3 rounded-lg border-2 text-xs font-medium ${
                        selected ? "border-konti-olive bg-konti-olive/15" : "border-white/10 bg-white/5"
                      }`}
                    >
                      {t(tr.label, tr.labelEs)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md text-white/60 hover:text-white text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> {t("Back", "Atrás")}
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canStep3}
                data-testid="btn-next-step2"
                className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold disabled:opacity-40"
              >
                {t("Continue", "Continuar")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6" data-testid="intake-step-contact">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2 text-konti-light">
                {t("How can we reach you?", "¿Cómo te contactamos?")}
              </h1>
              <p className="text-white/60 text-sm">
                {t("Your info is private and never shared.", "Tu información es privada y nunca compartida.")}
              </p>
            </div>

            <div className="space-y-3">
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                data-testid="input-name"
                placeholder={t("Full name", "Nombre completo")}
                className="w-full px-3 py-2.5 rounded-md bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/50"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="input-email"
                type="email"
                placeholder={t("Email", "Correo electrónico")}
                className="w-full px-3 py-2.5 rounded-md bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/50"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                data-testid="input-phone"
                placeholder={t("Phone", "Teléfono")}
                className="w-full px-3 py-2.5 rounded-md bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/50"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                data-testid="input-notes"
                rows={3}
                placeholder={t("Tell us anything else (optional)", "Cuéntanos algo más (opcional)")}
                className="w-full px-3 py-2.5 rounded-md bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/50 resize-none"
              />
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md text-white/60 hover:text-white text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> {t("Back", "Atrás")}
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canStep4}
                data-testid="btn-next-step3"
                className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold disabled:opacity-40"
              >
                {t("Book consultation", "Reservar consulta")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6" data-testid="intake-step-booking">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2 text-konti-light">
                {t("Pick a consultation", "Elige tu consulta")}
              </h1>
              <p className="text-white/60 text-sm">
                {t("Choose a 1:1 with our team or join the weekly group seminar.", "Elige una sesión 1:1 con nuestro equipo o únete al seminario semanal.")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/10">
              <button
                onClick={() => setBookingTab("consultation_30min")}
                data-testid="tab-consult"
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  bookingTab === "consultation_30min"
                    ? "border-konti-olive text-white"
                    : "border-transparent text-white/50 hover:text-white/80"
                }`}
              >
                <Video className="w-4 h-4 inline mr-1.5" />
                {t("1:1 Consultation (30min)", "Consulta 1:1 (30min)")}
              </button>
              <button
                onClick={() => setBookingTab("weekly_seminar")}
                data-testid="tab-seminar"
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  bookingTab === "weekly_seminar"
                    ? "border-konti-olive text-white"
                    : "border-transparent text-white/50 hover:text-white/80"
                }`}
              >
                <CalendarDays className="w-4 h-4 inline mr-1.5" />
                {t("Weekly Seminar", "Seminario Semanal")}
              </button>
            </div>

            {bookingTab === "consultation_30min" ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {consultationSlots.map((s, i) => {
                  const iso = s.date.toISOString();
                  const dateStr = s.date.toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric" });
                  const label = `${dateStr} • ${s.slot}`;
                  const selected = selectedSlot?.slot === iso && selectedSlot?.label === label;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSlot({ slot: iso, label })}
                      data-testid={`slot-${i}`}
                      className={`p-2.5 rounded-lg border-2 text-xs font-medium ${
                        selected ? "border-konti-olive bg-konti-olive/20" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div>{dateStr}</div>
                      <div className="text-konti-light/70 text-[11px] mt-0.5">{s.slot}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {seminarDates.map((d, i) => {
                  const dateStr = d.toLocaleDateString(lang === "es" ? "es-PR" : "en-US", {
                    weekday: "long", month: "long", day: "numeric",
                  });
                  const label = `${dateStr} • 10:00 AM`;
                  const iso = d.toISOString();
                  const selected = selectedSlot?.slot === iso;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSlot({ slot: iso, label })}
                      data-testid={`seminar-${i}`}
                      className={`w-full p-3 rounded-lg border-2 text-left text-sm flex items-center justify-between ${
                        selected ? "border-konti-olive bg-konti-olive/20" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <span className="capitalize">{dateStr}</span>
                      <span className="text-white/60 text-xs">10:00 AM</span>
                    </button>
                  );
                })}
              </div>
            )}

            {createLead.isError && (
              <p className="text-sm text-red-400">{t("Could not submit. Please try again.", "No se pudo enviar. Intenta de nuevo.")}</p>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md text-white/60 hover:text-white text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> {t("Back", "Atrás")}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => submitLead()}
                  disabled={createLead.isPending}
                  data-testid="btn-skip-booking"
                  className="px-4 py-2.5 rounded-md border border-white/15 hover:bg-white/5 text-white/80 text-sm"
                >
                  {t("Skip — just contact me", "Omitir — solo contáctenme")}
                </button>
                <button
                  onClick={() => selectedSlot && submitLead({ type: bookingTab, slot: selectedSlot.slot, label: selectedSlot.label })}
                  disabled={!selectedSlot || createLead.isPending}
                  data-testid="btn-submit-booking"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {createLead.isPending ? t("Submitting...", "Enviando...") : t("Confirm booking", "Confirmar reserva")}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && createdLeadId && (
          <div className="text-center space-y-6 py-12" data-testid="intake-success">
            <div className="w-16 h-16 mx-auto rounded-full bg-konti-olive/20 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-konti-olive" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold mb-3 text-konti-light">
                {t("Thank you!", "¡Gracias!")}
              </h1>
              <p className="text-white/70 max-w-md mx-auto">
                {t(
                  "Your inquiry is in. A KONTi team member will reach out within 1 business day.",
                  "Tu solicitud fue recibida. Un miembro del equipo KONTi te contactará en 1 día hábil."
                )}
              </p>
              {selectedSlot && (
                <p className="text-konti-olive text-sm mt-4 font-medium">
                  {t("Booking confirmed:", "Reserva confirmada:")} {selectedSlot.label}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/login"
                className="px-6 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold"
              >
                {t("Back to home", "Volver al inicio")}
              </Link>
              <button
                onClick={() => {
                  setForm({ source: "", projectType: "", location: "", budgetRange: "", terrainStatus: "", contactName: "", email: "", phone: "", notes: "" });
                  setSelectedSlot(null);
                  setCreatedLeadId(null);
                  setStep(1);
                }}
                className="px-6 py-2.5 rounded-md border border-white/15 hover:bg-white/5 text-white/80 text-sm"
              >
                {t("Submit another", "Enviar otra")}
              </button>
            </div>
          </div>
        )}

        {step < 5 && (
          <div className="mt-12 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <FileSignature className="w-3 h-3" />
              {t("By submitting, you agree to be contacted by KONTi about your inquiry.", "Al enviar, aceptas ser contactado por KONTi sobre tu solicitud.")}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
