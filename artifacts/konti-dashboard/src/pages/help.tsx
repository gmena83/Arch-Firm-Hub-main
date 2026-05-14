// P7.2 — In-app Help page that renders the bilingual user manual from
// `docs/user-manual.md`. The markdown is bundled at build time via Vite's
// `?raw` import so the page works offline and the deployed bundle always
// matches the committed manual.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { BookOpen } from "lucide-react";

// Vite raw-import. Path is relative to this file → up 4 levels to repo root → docs/user-manual.md.
import manualMd from "../../../../docs/user-manual.md?raw";

export default function HelpPage() {
  const { t } = useLang();
  return (
    <RequireAuth>
      <AppLayout>
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10" data-testid="help-page">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-konti-olive" />
              {t("Help & User Manual", "Ayuda y Manual del Usuario")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "Daily-flow walkthroughs, role-by-role surface tour, and what's coming next.",
                "Recorridos del flujo diario, vista por rol, y lo que viene.",
              )}
            </p>
          </header>
          <article
            className="prose prose-sm sm:prose-base max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-a:text-konti-olive prose-code:text-konti-olive prose-table:text-sm"
            data-testid="help-manual-content"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{manualMd}</ReactMarkdown>
          </article>
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
