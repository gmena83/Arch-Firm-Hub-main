import { useState, createContext, useContext, useCallback } from "react";

type Lang = "en" | "es";

interface LangContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (en: string, es: string) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("konti_lang") as Lang) ?? "en";
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "en" ? "es" : "en";
      localStorage.setItem("konti_lang", next);
      return next;
    });
  }, []);

  const t = useCallback(
    (en: string, es: string) => (lang === "en" ? en : es),
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
