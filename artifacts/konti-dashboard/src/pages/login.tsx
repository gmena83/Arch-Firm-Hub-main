import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-lang";
import logoGreen from "@assets/Horizontal01_VerdePNG_extracted.png";
import logoWhite from "@assets/Horizontal02_WhitePNG_1776258303461.png";
import menatechLogo from "@assets/menatech}_1776274281761.png";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { t, lang, toggleLang } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.user as Parameters<typeof login>[1]);
        setLocation("/dashboard");
      },
      onError: () => {
        setError(t("Invalid email or password.", "Correo o contraseña incorrectos."));
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <>
      <style>{`
        @keyframes konti-fade-in-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .konti-logo-anim {
          animation: konti-fade-in-up 1.2s ease-out both;
        }
      `}</style>

      <div className="min-h-screen flex flex-col md:flex-row" data-testid="login-page">
        {/* Left panel — dark brand */}
        <div className="hidden md:flex flex-col justify-between w-1/2 bg-konti-dark p-12">
          <img
            src={logoWhite}
            alt="KONTi"
            className="konti-logo-anim h-auto w-full max-w-[560px] object-contain"
            data-testid="login-logo"
          />
          <div>
            <h1 className="font-display text-5xl font-bold text-konti-light leading-tight mb-4">
              {t("Build the future.", "Construye el futuro.")}
            </h1>
            <p className="text-konti-light/60 text-lg">
              {t(
                "Sustainable architecture. Resilient design. Built for Puerto Rico.",
                "Arquitectura sostenible. Diseño resiliente. Hecho para Puerto Rico."
              )}
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-konti-olive flex items-center justify-center text-white text-sm font-bold">CG</div>
              <div>
                <p className="text-konti-light text-sm font-semibold">Carla Gautier</p>
                <p className="text-konti-light/50 text-xs">{t("CEO & Founder", "CEO y Fundadora")}</p>
              </div>
            </div>
            <a
              href="https://menatech.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity"
              data-testid="menatech-attribution-login"
            >
              <img src={menatechLogo} alt="Menatech" className="h-5 w-5 object-contain rounded" />
              <span className="text-konti-light/80 text-xs">{t("Powered by", "Desarrollado por")}</span>
              <span className="text-konti-light text-xs font-semibold">menatech</span>
            </a>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-8 py-8 sm:py-12 bg-background">
          <div className="w-full max-w-sm">
            <div className="mb-8 md:hidden">
              <img src={logoGreen} alt="KONTi" className="h-auto w-auto max-h-10 max-w-[200px] object-contain" />
            </div>

            <div className="flex justify-end mb-6">
              <button
                onClick={toggleLang}
                data-testid="lang-toggle-login"
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {lang === "en" ? "ES" : "EN"}
              </button>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-1">
              {t("Welcome back", "Bienvenido")}
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              {t("Sign in to your KONTi workspace", "Inicia sesión en tu espacio de trabajo KONTi")}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="email">
                  {t("Email", "Correo electrónico")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                  className="w-full px-3 py-2.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="you@konti.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="password">
                  {t("Password", "Contraseña")}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                  className="w-full px-3 py-2.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="login-error">{error}</p>
              )}

              <button
                type="submit"
                disabled={loginMutation.isPending}
                data-testid="btn-login"
                className="w-full py-2.5 px-4 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                {loginMutation.isPending
                  ? t("Signing in...", "Iniciando sesión...")
                  : t("Sign in", "Iniciar sesión")}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-xs text-muted-foreground mb-2">
                {t("New to KONTi?", "¿Nuevo en KONTi?")}
              </p>
              <Link
                href="/intake"
                data-testid="link-intake"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-konti-olive hover:underline"
              >
                {t("Start a project →", "Iniciar un proyecto →")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
