import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/protected-route";
import { setBaseUrl } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Templates from "@/pages/templates";
import TemplateDetail from "@/pages/template-detail";
import DeploymentDetail from "@/pages/deployment-detail";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminTemplateNew from "@/pages/admin-template-new";
import AdminDevelopersPage from "@/pages/admin-developers";
import OAuthCallback from "@/pages/oauth-callback";
import WalletPage from "@/pages/wallet";
import MyBotsPage from "@/pages/my-bots";
import DocsPage from "@/pages/docs";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import DevelopersPage from "@/pages/developers";

// API calls use relative paths proxied to the backend by Vite in dev,
// and served from the same origin in production.
setBaseUrl("");

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/oauth-callback" component={OAuthCallback} />
      <Route path="/docs" component={DocsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/developers" component={DevelopersPage} />

      {/* Protected user routes */}
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/my-bots">
        <ProtectedRoute><MyBotsPage /></ProtectedRoute>
      </Route>
      <Route path="/templates">
        <ProtectedRoute><Templates /></ProtectedRoute>
      </Route>
      <Route path="/templates/:id">
        {() => <ProtectedRoute><TemplateDetail /></ProtectedRoute>}
      </Route>
      <Route path="/deployments/:id">
        {() => <ProtectedRoute><DeploymentDetail /></ProtectedRoute>}
      </Route>
      <Route path="/wallet">
        <ProtectedRoute><WalletPage /></ProtectedRoute>
      </Route>

      {/* Admin only */}
      <Route path="/admin">
        <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
      </Route>
      <Route path="/admin/templates/new">
        <ProtectedRoute adminOnly><AdminTemplateNew /></ProtectedRoute>
      </Route>
      <Route path="/admin/developers">
        <ProtectedRoute adminOnly><AdminDevelopersPage /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="junex-theme">
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
