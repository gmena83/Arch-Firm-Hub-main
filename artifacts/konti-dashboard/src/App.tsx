import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import { LangProvider } from "@/hooks/use-lang";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import ProjectReportPage from "@/pages/project-report";
import CalculatorPage from "@/pages/calculator";
import MaterialsPage from "@/pages/materials";
import AiAssistantPage from "@/pages/ai-assistant";
import SettingsPage from "@/pages/settings";
import TeamPage from "@/pages/team";
import PermitsPage from "@/pages/permits";
import IntakePage from "@/pages/intake";
import LeadsPage from "@/pages/leads";
import AuditPage from "@/pages/audit";
import IntegrationsPage from "@/pages/integrations";
import FieldAdminPage from "@/pages/field-admin";
import HelpPage from "@/pages/help";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 2 },
  },
});

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Redirect to={isAuthenticated ? "/dashboard" : "/login"} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id/report" component={ProjectReportPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/calculator" component={CalculatorPage} />
      <Route path="/materials" component={MaterialsPage} />
      <Route path="/ai" component={AiAssistantPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/team" component={TeamPage} />
      <Route path="/permits" component={PermitsPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/audit" component={AuditPage} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/field-admin" component={FieldAdminPage} />
      <Route path="/help" component={HelpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}

export default App;
