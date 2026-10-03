import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ProtectedRoute } from "@/components/protected-route";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useGetAdminStats, useListAdminUsers, useListAdminDeployments,
  useListTemplates, useDeleteTemplate, useSuspendDeployment,
  getListTemplatesQueryKey, getListAdminDeploymentsQueryKey,
  getGetAdminStatsQueryKey, getListAdminUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2, Users, Server, LayoutTemplate, Activity, Ban, Trash2,
  Plus, Github, ExternalLink, Bot, ShieldCheck, TrendingUp, Zap,
  Eye, Globe, AlertCircle, CheckCircle2, Clock, XCircle, UserCircle2,
  Pencil, Terminal, UserX, UserCheck, RefreshCw, Database,
  Wifi, WifiOff, DollarSign, KeyRound, Coins, CreditCard, Star, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AdminTemplateEditModal } from "@/components/admin-template-edit-modal";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";
type AdminTransaction = {
  id: string; kind: "wallet" | "coins" | "payment"; userId: number; username: string; email: string;
  type: string; amount: number; currency: string; status: string; method: string;
  reference: string | null; description: string; createdAt: string;
};
function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { cls: string; icon: React.ReactNode }> = {
    online:    { cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
    offline:   { cls: "bg-slate-500/15 text-slate-400 border-slate-500/20", icon: <XCircle className="h-3 w-3" /> },
    error:     { cls: "bg-red-500/15 text-red-500 border-red-500/20", icon: <AlertCircle className="h-3 w-3" /> },
    building:  { cls: "bg-blue-500/15 text-blue-400 border-blue-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    queued:    { cls: "bg-amber-500/15 text-amber-500 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
    suspended: { cls: "bg-red-500/15 text-red-400 border-red-500/20", icon: <Ban className="h-3 w-3" /> },
    expired:   { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
    archived:  { cls: "bg-slate-500/15 text-slate-400 border-slate-500/20", icon: <Trash2 className="h-3 w-3" /> },
  };
  const { cls, icon } = config[status] ?? config.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {icon} {status}
    </span>
  );
}

function StatCard({ title, value, icon: Icon, gradient, sub }: {
  title: string; value: number | undefined; icon: React.ElementType; gradient: string; sub?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/40">
      <div className={`absolute inset-0 opacity-10 ${gradient}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${gradient} bg-opacity-20`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-3xl font-bold tracking-tight">
          {value === undefined ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LogLine({ line }: { line: string }) {
  if (!line || line.trim() === "") return <div className="h-1.5" />;
  const isError = line.includes("ERROR") || line.includes("error");
  const isSuccess = line.includes("successful") || line.includes("online") || line.includes("live");
  const isDivider = line.startsWith("--");
  return (
    <div className={`font-mono text-xs leading-5 ${
      isError ? "text-red-400" : isSuccess ? "text-emerald-400" : isDivider ? "text-slate-500 italic" : "text-slate-300"
    }`}>{line}</div>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("templates");
  const [userSearch, setUserSearch] = useState("");
  const [coinCreditUser, setCoinCreditUser] = useState<{ id: number; username: string; email: string; coinBalance: number } | null>(null);
  const [coinCreditAmount, setCoinCreditAmount] = useState("");
  const [isCreditingCoins, setIsCreditingCoins] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [logsBot, setLogsBot] = useState<{ id: number; name: string } | null>(null);
  const [botLogs, setBotLogs] = useState<string[]>([]);
  const [isLoadingBotLogs, setIsLoadingBotLogs] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [herokuKey, setHerokuKey] = useState("");
  const [herokuKeyPreview, setHerokuKeyPreview] = useState<string | null>(null);
  const [isSavingHerokuKey, setIsSavingHerokuKey] = useState(false);
  const [herokuTeamKey, setHerokuTeamKey] = useState("");
  const [herokuTeams, setHerokuTeams] = useState<Array<{ name: string; role: string | null }>>([]);
  const [selectedHerokuTeam, setSelectedHerokuTeam] = useState("");
  const [savedHerokuTeam, setSavedHerokuTeam] = useState<string | null>(null);
  const [herokuTeamPreview, setHerokuTeamPreview] = useState<string | null>(null);
  const [teamLookupError, setTeamLookupError] = useState<string | null>(null);
  const [isLoadingHerokuTeams, setIsLoadingHerokuTeams] = useState(false);
  const [isSavingHerokuTeam, setIsSavingHerokuTeam] = useState(false);

  useEffect(() => {
    if (herokuTeamKey.trim().length < 10) {
      setHerokuTeams([]);
      setSelectedHerokuTeam("");
      setTeamLookupError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingHerokuTeams(true);
      setTeamLookupError(null);
      try {
        const res = await fetch(`${API_BASE}/api/admin/settings/heroku/teams`, {
          method: "POST",
          headers: authHeader(),
          body: JSON.stringify({ apiKey: herokuTeamKey.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load teams");
        if (!cancelled) {
          setHerokuTeams(data.teams ?? []);
          setSelectedHerokuTeam((current) => data.teams?.some((team: { name: string }) => team.name === current) ? current : "");
          if (!data.teams?.length) setTeamLookupError("This key has no teams available.");
        }
      } catch (error) {
        if (!cancelled) {
          setHerokuTeams([]);
          setSelectedHerokuTeam("");
          setTeamLookupError(error instanceof Error ? error.message : "Could not load teams");
        }
      } finally {
        if (!cancelled) setIsLoadingHerokuTeams(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [herokuTeamKey]);

  const { data: stats } = useGetAdminStats();
  const { data: users, isLoading: isLoadingUsers } = useListAdminUsers();
  const { data: deployments, isLoading: isLoadingDeployments, isError: hasDeploymentsError, error: deploymentsError, refetch: refetchDeployments, isFetching: isFetchingDeployments } = useListAdminDeployments({
    query: { queryKey: getListAdminDeploymentsQueryKey(), refetchInterval: 15_000 },
    request: { cache: "no-store" },
  });
  const { data: templates, isLoading: isLoadingTemplates } = useListTemplates();
  const { data: transactionsData, isLoading: isLoadingTransactions, isError: hasTransactionsError, error: transactionsError, refetch: refetchTransactions } = useQuery<{ transactions: AdminTransaction[] }>({
    queryKey: ["admin-transactions"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/admin/transactions`, { headers: authHeader(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load transaction history");
      return data;
    },
    refetchInterval: 30_000,
  });

  const suspendMutation = useSuspendDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot suspended on Heroku" });
        queryClient.invalidateQueries({ queryKey: getListAdminDeploymentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      },
    },
  });

  const deleteTemplateMutation = useDeleteTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template deleted" });
        queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      },
    },
  });

  async function handleSuspendUser(userId: number, username: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}/suspend`, { method: "POST", headers: authHeader() });
    if (res.ok) {
      toast({ title: `${username} suspended — all bots stopped` });
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListAdminDeploymentsQueryKey() });
    } else { toast({ title: "Failed to suspend user", variant: "destructive" }); }
  }

  async function handleUnsuspendUser(userId: number, username: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}/unsuspend`, { method: "POST", headers: authHeader() });
    if (res.ok) {
      toast({ title: `${username} unsuspended` });
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    } else { toast({ title: "Failed to unsuspend user", variant: "destructive" }); }
  }

  async function handleDeleteUser(userId: number) {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, { method: "DELETE", headers: authHeader() });
    if (res.ok) {
      toast({ title: "User deleted — all bots removed from Heroku" });
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListAdminDeploymentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
    } else { toast({ title: "Failed to delete user", variant: "destructive" }); }
  }

  async function handleCreditCoins() {
    if (!coinCreditUser) return;
    const amount = Number(coinCreditAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast({ title: "Enter a positive whole number of coins", variant: "destructive" });
      return;
    }
    setIsCreditingCoins(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${coinCreditUser.id}/coins`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add coins");
      toast({ title: `${amount} coins added`, description: `${data.username}'s balance is now ${data.coinBalance} coins.` });
      setCoinCreditUser(null);
      setCoinCreditAmount("");
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Could not add coins", variant: "destructive" });
    } finally {
      setIsCreditingCoins(false);
    }
  }

  async function handleDeleteBot(depId: number) {
    const res = await fetch(`${API_BASE}/api/admin/deployments/${depId}`, { method: "DELETE", headers: authHeader() });
    if (res.ok) {
      toast({ title: "Bot deleted from Heroku" });
      queryClient.invalidateQueries({ queryKey: getListAdminDeploymentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
    } else { toast({ title: "Failed to delete bot", variant: "destructive" }); }
  }

  async function handleViewBotLogs(depId: number, botName: string) {
    setLogsBot({ id: depId, name: botName });
    setBotLogs([]);
    setIsLoadingBotLogs(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/deployments/${depId}/logs`, { headers: authHeader() });
      const data = await res.json();
      setBotLogs(data.lines ?? []);
    } catch { setBotLogs(["Failed to fetch logs"]); }
    finally { setIsLoadingBotLogs(false); }
  }

  async function loadHealth() {
    setIsLoadingHealth(true);
    try {
      const [healthRes, keyRes, teamRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/health`, { headers: authHeader() }),
        fetch(`${API_BASE}/api/admin/settings/heroku`, { headers: authHeader() }),
        fetch(`${API_BASE}/api/admin/settings/heroku/team`, { headers: authHeader() }),
      ]);
      const data = await healthRes.json();
      setHealth(data);
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        setHerokuKeyPreview(keyData.preview ?? null);
      }
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setSavedHerokuTeam(teamData.teamName ?? null);
        setHerokuTeamPreview(teamData.preview ?? null);
      }
    } catch { toast({ title: "Failed to load health data", variant: "destructive" }); }
    finally { setIsLoadingHealth(false); }
  }

  async function saveHerokuKey() {
    if (!herokuKey.trim()) return;
    setIsSavingHerokuKey(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings/heroku`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ apiKey: herokuKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to save key", description: data.error, variant: "destructive" });
        return;
      }
      setHerokuKeyPreview(data.preview);
      setHerokuKey("");
      setHealth((prev: any) => prev ? { ...prev, integrations: { ...prev.integrations, heroku: "connected" } } : prev);
      toast({ title: "Heroku key saved", description: "Deployments will now use the new key." });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setIsSavingHerokuKey(false); }
  }

  async function saveHerokuTeam() {
    if (!herokuTeamKey.trim() || !selectedHerokuTeam) return;
    setIsSavingHerokuTeam(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings/heroku/team`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ apiKey: herokuTeamKey.trim(), teamName: selectedHerokuTeam }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to save team key", description: data.error, variant: "destructive" });
        return;
      }
      setSavedHerokuTeam(data.teamName);
      setHerokuTeamPreview(data.preview);
      setHerokuTeamKey("");
      setHerokuTeams([]);
      setSelectedHerokuTeam("");
      setHealth((prev: any) => prev ? { ...prev, integrations: { ...prev.integrations, heroku: "connected" } } : prev);
      toast({ title: "Heroku team saved", description: `New bots will deploy to ${data.teamName}.` });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setIsSavingHerokuTeam(false); }
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    if (tab === "health" && !health) loadHealth();
  }

  const onlineRate = stats
    ? stats.totalDeployments > 0 ? Math.round((stats.onlineDeployments / stats.totalDeployments) * 100) : 100
    : null;

  const quickActions = [
    { label: "Add Template", icon: Plus, href: "/admin/templates/new", color: "text-primary" },
    { label: "View Deployments", icon: Eye, action: () => handleTabChange("deployments"), color: "text-blue-500" },
    { label: "Manage Users", icon: Users, action: () => handleTabChange("users"), color: "text-emerald-500" },
    { label: "Manage Team", icon: UserCircle2, href: "/admin/developers", color: "text-purple-400" },
    { label: "Hosting Plans", icon: KeyRound, href: "/admin/plans", color: "text-cyan-400" },
    { label: "Platform Health", icon: Zap, action: () => handleTabChange("health"), color: "text-amber-500" },
  ];

  return (
    <ProtectedRoute adminOnly>
      <Layout>
        <div className="min-h-screen bg-background">
          <div className="container px-4 md:px-8 py-8 mx-auto max-w-7xl space-y-8">

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-primary">Admin Control Center</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Platform Overview</h1>
                <p className="text-muted-foreground mt-1">Manage templates, monitor deployments, and oversee users.</p>
              </div>
              <Button asChild className="gap-2 shadow-lg shadow-primary/20">
                <Link href="/admin/templates/new"><Plus className="h-4 w-4" /> Add Template</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Registered Users" value={stats?.totalUsers} icon={Users}
                gradient="bg-gradient-to-br from-violet-600 to-purple-800" sub="Total accounts" />
              <StatCard title="Total Deployments" value={stats?.totalDeployments} icon={Server}
                gradient="bg-gradient-to-br from-blue-600 to-indigo-800" sub="All-time deployments" />
              <StatCard title="Live Right Now" value={stats?.onlineDeployments} icon={Activity}
                gradient="bg-gradient-to-br from-emerald-600 to-teal-800"
                sub={onlineRate !== null ? `${onlineRate}% uptime rate` : undefined} />
              <StatCard title="Bot Templates" value={stats?.totalTemplates} icon={LayoutTemplate}
                gradient="bg-gradient-to-br from-amber-600 to-orange-800" sub="Available in gallery" />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((item) => (
                item.href ? (
                  <Link key={item.label} href={item.href}>
                    <Card className="cursor-pointer hover:border-primary/40 transition-colors group border-border/40">
                      <CardContent className="flex items-center gap-3 py-3 px-4">
                        <item.icon className={`h-4 w-4 ${item.color} group-hover:scale-110 transition-transform`} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ) : (
                  <Card key={item.label} className="cursor-pointer hover:border-primary/40 transition-colors group border-border/40"
                    onClick={(item as any).action}>
                    <CardContent className="flex items-center gap-3 py-3 px-4">
                      <item.icon className={`h-4 w-4 ${item.color} group-hover:scale-110 transition-transform`} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </CardContent>
                  </Card>
                )
              ))}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
                <TabsTrigger value="templates" className="gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5" /> Templates
                  {templates && <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{templates.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="deployments" className="gap-2">
                  <Server className="h-3.5 w-3.5" /> Bots
                  {deployments && <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{deployments.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-3.5 w-3.5" /> Users
                  {users && <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{users.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="transactions" className="gap-2">
                  <CreditCard className="h-3.5 w-3.5" /> Transactions
                  {transactionsData && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{transactionsData.transactions.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="health" className="gap-2">
                  <Activity className="h-3.5 w-3.5" /> Health
                </TabsTrigger>
              </TabsList>

              {/* ── Templates Tab ── */}
              <TabsContent value="templates" className="mt-6">
                {isLoadingTemplates ? (
                  <div className="flex h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
                ) : templates && templates.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((t) => {
                      const appJson = t.appJson as { env?: Record<string, unknown>; logo?: string };
                      const logo = t.thumbnail ?? appJson?.logo;
                      const envCount = Object.keys(appJson?.env ?? {}).length;
                      const deployCount = t.deployCount ?? deployments?.filter((d) => d.templateId === t.id).length ?? 0;
                      return (
                        <Card key={t.id} className="group flex flex-col overflow-hidden border-border/40 hover:border-primary/40 hover:shadow-lg transition-all">
                          <div className="relative h-24 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                            {logo ? (
                              <img src={logo} alt={t.name} className="h-16 w-16 rounded-xl object-cover shadow-md"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Bot className="h-8 w-8 text-primary/60" />
                              </div>
                            )}
                            <Badge variant="outline" className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm">
                              {t.category}
                            </Badge>
                          </div>
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">{t.name}{t.isFeatured && <Badge className="gap-1 border-amber-500/20 bg-amber-500/10 px-1.5 text-[10px] text-amber-300"><Star className="h-3 w-3 fill-current" /> Featured</Badge>}</CardTitle>
                            <CardDescription className="text-xs line-clamp-2">{t.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="flex-1 pb-3">
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Server className="h-3 w-3" /> {deployCount} deploys</span>
                              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> {envCount} env vars</span>
                            </div>
                            <a href={t.githubRepo} target="_blank" rel="noopener noreferrer"
                              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate transition-colors">
                              <Github className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{t.githubRepo.replace("https://github.com/", "")}</span>
                              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                            </a>
                          </CardContent>
                          <Separator />
                          <div className="flex items-center justify-between px-4 py-2">
                            <span className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy")}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10 h-7 w-7 p-0"
                                onClick={() => { setEditingTemplate(t); setShowEditModal(true); }} title="Edit template">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 w-7 p-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Template</AlertDialogTitle>
                                    <AlertDialogDescription>Permanently deletes <strong>{t.name}</strong>.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteTemplateMutation.mutate({ id: t.id })}
                                      className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                    <Link href="/admin/templates/new">
                      <Card className="h-full min-h-[220px] flex flex-col items-center justify-center border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-all group">
                        <div className="p-4 rounded-full bg-primary/10 mb-3 group-hover:bg-primary/20 transition-colors">
                          <Plus className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Add New Template</p>
                        <p className="text-xs text-muted-foreground mt-1">Auto-fetch from GitHub</p>
                      </Card>
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <LayoutTemplate className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-muted-foreground text-sm">No templates yet.</p>
                    <Button asChild size="sm"><Link href="/admin/templates/new"><Plus className="h-4 w-4 mr-2" /> Add First Template</Link></Button>
                  </div>
                )}
              </TabsContent>

              {/* ── Bots Tab ── */}
              <TabsContent value="deployments" className="mt-6">
                <Card className="border-border/40">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>All Deployed Bots</CardTitle>
                        <CardDescription>Monitor, suspend, delete and view logs of every bot.</CardDescription>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => void refetchDeployments()} disabled={isFetchingDeployments}>
                          <RefreshCw className={`h-3.5 w-3.5 ${isFetchingDeployments ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                        <Globe className="h-4 w-4 text-emerald-500" />
                        <span>{stats?.onlineDeployments ?? 0} online</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isLoadingDeployments ? (
                      <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : hasDeploymentsError ? (
                      <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground">Could not load deployments: {deploymentsError instanceof Error ? deploymentsError.message : "Request failed"}</p>
                        <Button variant="outline" size="sm" onClick={() => void refetchDeployments()}>Try again</Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="pl-6">Bot</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Template</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Heroku App</TableHead>
                            <TableHead>Deployed</TableHead>
                            <TableHead className="text-right pr-6">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deployments?.map((dep) => (
                            <TableRow key={dep.id} className="border-border/40 hover:bg-muted/30">
                              <TableCell className="pl-6">
                                <div className="font-medium text-sm">{dep.botName}</div>
                                <div className="text-xs text-muted-foreground font-mono">#{dep.id}</div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{(dep as any).username ?? `uid:${dep.userId}`}</span>
                              </TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{dep.templateName}</Badge></TableCell>
                              <TableCell><StatusBadge status={dep.status} /></TableCell>
                              <TableCell>
                                <span className="font-mono text-xs text-muted-foreground truncate max-w-[100px] block">{dep.herokuAppId ?? "-"}</span>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{format(new Date(dep.createdAt), "MMM d, yyyy")}</TableCell>
                              <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-1">
                                  {/* View Logs */}
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                                    onClick={() => handleViewBotLogs(dep.id, dep.botName)} title="View logs">
                                    <Terminal className="h-3.5 w-3.5" />
                                  </Button>
                                  {/* Suspend */}
                                  {dep.status !== "suspended" && (
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-500 hover:bg-amber-500/10 text-xs"
                                      disabled={suspendMutation.isPending}
                                      onClick={() => suspendMutation.mutate({ id: dep.id })}>
                                      <Ban className="h-3.5 w-3.5 mr-1" /> Suspend
                                    </Button>
                                  )}
                                  {/* Delete */}
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete {dep.botName}?</AlertDialogTitle>
                                        <AlertDialogDescription>Permanently deletes the bot and removes it from Heroku.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction className="bg-destructive text-destructive-foreground"
                                          onClick={() => handleDeleteBot(dep.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!deployments || deployments.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />No deployments yet.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Users Tab ── */}
              <TabsContent value="users" className="mt-6">
                <Card className="border-border/40">
                  <CardHeader className="pb-4">
                    <CardTitle>Registered Users</CardTitle>
                    <CardDescription>Suspend, unsuspend or delete user accounts.</CardDescription>
                    <div className="relative mt-2 max-w-md">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Search by email or username"
                        aria-label="Search users by email or username"
                        className="pl-9"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isLoadingUsers ? (
                      <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="pl-6">User</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Coins</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Bots</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right pr-6">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users?.filter((u: any) => {
                            const query = userSearch.trim().toLowerCase();
                            return !query || String(u.email).toLowerCase().includes(query) || String(u.username).toLowerCase().includes(query);
                          }).map((u: any) => {
                            const userDeployCount = deployments?.filter((d) => d.userId === u.id).length ?? 0;
                            const isSuspended = u.suspended ?? false;
                            const isAdmin = u.role === "admin";
                            return (
                              <TableRow key={u.id} className={`border-border/40 hover:bg-muted/30 ${isSuspended ? "opacity-60" : ""}`}>
                                <TableCell className="pl-6">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className={`text-xs font-bold ${isSuspended ? "bg-red-500/20 text-red-400" : "bg-primary/10 text-primary"}`}>
                                        {u.username.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium text-sm">{u.username}</div>
                                      <div className="text-xs text-muted-foreground font-mono">#{u.id}</div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                                <TableCell className="whitespace-nowrap text-sm font-medium"><span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-amber-500" />{u.coinBalance ?? 0}</span></TableCell>
                                <TableCell>
                                  <Badge variant={isAdmin ? "default" : "outline"}
                                    className={isAdmin ? "bg-primary/20 text-primary border-primary/30 hover:bg-primary/20" : ""}>
                                    {isAdmin && <ShieldCheck className="h-3 w-3 mr-1" />}
                                    {u.role}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {isSuspended ? (
                                    <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-xs">Suspended</Badge>
                                  ) : (
                                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Active</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm">
                                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                                    <span>{userDeployCount}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{format(new Date(u.createdAt), "MMM d, yyyy")}</TableCell>
                                <TableCell className="text-right pr-6">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1"
                                      onClick={() => { setCoinCreditUser({ id: u.id, username: u.username, email: u.email, coinBalance: u.coinBalance ?? 0 }); setCoinCreditAmount(""); }}>
                                      <Coins className="h-3.5 w-3.5" /> Add coins
                                    </Button>
                                    {!isAdmin && (
                                      <>
                                      {/* Suspend / Unsuspend */}
                                      {isSuspended ? (
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-500 hover:bg-emerald-500/10 text-xs gap-1"
                                          onClick={() => handleUnsuspendUser(u.id, u.username)}>
                                          <UserCheck className="h-3.5 w-3.5" /> Unsuspend
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-500 hover:bg-amber-500/10 text-xs gap-1"
                                          onClick={() => handleSuspendUser(u.id, u.username)}>
                                          <UserX className="h-3.5 w-3.5" /> Suspend
                                        </Button>
                                      )}
                                      {/* Delete */}
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete {u.username}?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This permanently deletes the account and all their bots from Heroku. Cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction className="bg-destructive text-destructive-foreground"
                                              onClick={() => handleDeleteUser(u.id)}>Delete Account</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {(!users || users.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />No users registered yet.
                              </TableCell>
                            </TableRow>
                          )}
                          {users && users.length > 0 && !users.some((u: any) => String(u.email).toLowerCase().includes(userSearch.trim().toLowerCase()) || String(u.username).toLowerCase().includes(userSearch.trim().toLowerCase())) && (
                            <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No users match this search.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Platform Health Tab ── */}
              <TabsContent value="transactions" className="mt-6">
                <Card className="border-border/40">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>Transaction history</CardTitle>
                      <CardDescription>Cash top-ups, coin credits and plan charges, plus legacy template payments.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void refetchTransactions()}>
                      <RefreshCw className={`h-3.5 w-3.5 ${isLoadingTransactions ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isLoadingTransactions ? (
                      <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : hasTransactionsError ? (
                      <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground">Could not load transactions: {transactionsError instanceof Error ? transactionsError.message : "Request failed"}</p>
                        <Button variant="outline" size="sm" onClick={() => void refetchTransactions()}>Try again</Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow className="border-border/40 hover:bg-transparent">
                            <TableHead className="pl-6">User</TableHead><TableHead>Transaction</TableHead><TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {transactionsData?.transactions.map((transaction) => (
                              <TableRow key={transaction.id} className="border-border/40">
                                <TableCell className="pl-6"><div className="font-medium text-sm">{transaction.username}</div><div className="text-xs text-muted-foreground">{transaction.email}</div></TableCell>
                                <TableCell><div className="text-sm capitalize">{transaction.type}</div><div className="max-w-56 truncate text-xs text-muted-foreground" title={transaction.description}>{transaction.description}</div></TableCell>
                                <TableCell className="whitespace-nowrap font-mono text-sm">{transaction.currency === "COIN" ? `${transaction.type === "debit" ? "−" : "+"}${transaction.amount} coins` : `${transaction.currency} ${(transaction.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</TableCell>
                                <TableCell><Badge variant="outline" className={transaction.status === "success" ? "border-emerald-500/30 text-emerald-400" : transaction.status === "failed" ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}>{transaction.status}</Badge></TableCell>
                                <TableCell className="text-sm capitalize text-muted-foreground">{transaction.method}</TableCell>
                                <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={transaction.reference ?? undefined}>{transaction.reference ?? "—"}</TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{format(new Date(transaction.createdAt), "MMM d, yyyy HH:mm")}</TableCell>
                              </TableRow>
                            ))}
                            {!transactionsData?.transactions.length && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground"><Coins className="mx-auto mb-2 h-8 w-8 opacity-30" />No transactions recorded yet.</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="health" className="mt-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Platform Health</h2>
                    <Button variant="outline" size="sm" className="gap-2" onClick={loadHealth} disabled={isLoadingHealth}>
                      <RefreshCw className={`h-4 w-4 ${isLoadingHealth ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>

                  {isLoadingHealth ? (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !health ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 border border-dashed rounded-xl border-border/60">
                      <Activity className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-muted-foreground text-sm">Click Refresh to load platform health data</p>
                      <Button size="sm" onClick={loadHealth}>Load Health Data</Button>
                    </div>
                  ) : (
                    <>
                      {/* Integration Status */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="border-border/40">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                              <Database className="h-4 w-4" /> Database
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="font-semibold text-emerald-400">Connected</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Neon PostgreSQL</p>
                          </CardContent>
                        </Card>
                        <Card className="border-border/40">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                              <Server className="h-4 w-4" /> Heroku
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center gap-2">
                              {health.integrations.heroku === "connected" ? (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span className="font-semibold text-emerald-400">Connected</span>
                                </>
                              ) : health.integrations.heroku === "not_configured" ? (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                                  <span className="font-semibold text-amber-400">Not Configured</span>
                                </>
                              ) : (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                                  <span className="font-semibold text-red-400">Error</span>
                                </>
                              )}
                            </div>
                            {herokuKeyPreview && (
                              <p className="text-xs text-muted-foreground font-mono">{herokuKeyPreview}</p>
                            )}
                            <div className="flex gap-2 pt-1">
                              <div className="relative flex-1">
                                <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  type="password"
                                  placeholder={herokuKeyPreview ? "Replace key…" : "Paste Heroku API key"}
                                  className="pl-8 text-xs h-8 font-mono"
                                  value={herokuKey}
                                  onChange={(e) => setHerokuKey(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && saveHerokuKey()}
                                />
                              </div>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs"
                                disabled={!herokuKey.trim() || isSavingHerokuKey}
                                onClick={saveHerokuKey}
                              >
                                {isSavingHerokuKey ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="border-border/40">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <KeyRound className="h-4 w-4" /> Heroku Team Key
                          </CardTitle>
                          <CardDescription>
                            Paste a key with team access. Available teams load automatically; select where new bots should be deployed.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {savedHerokuTeam && (
                            <div className="text-xs text-muted-foreground">
                              Active deployment team: <span className="font-semibold text-foreground">{savedHerokuTeam}</span>
                              {herokuTeamPreview && <span className="ml-2 font-mono">{herokuTeamPreview}</span>}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                              type="password"
                              placeholder={herokuTeamPreview ? "Paste a replacement team key" : "Paste Heroku team API key"}
                              className="text-xs font-mono sm:max-w-md"
                              value={herokuTeamKey}
                              onChange={(e) => setHerokuTeamKey(e.target.value)}
                            />
                            <div className="flex min-w-48 items-center gap-2">
                              {isLoadingHerokuTeams ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                              <select
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={selectedHerokuTeam}
                                onChange={(e) => setSelectedHerokuTeam(e.target.value)}
                                disabled={!herokuTeams.length || isLoadingHerokuTeams}
                                aria-label="Select Heroku team"
                              >
                                <option value="">{herokuTeams.length ? "Select a team" : "Teams appear here"}</option>
                                {herokuTeams.map((team) => <option key={team.name} value={team.name}>{team.name}</option>)}
                              </select>
                            </div>
                            <Button
                              size="sm"
                              disabled={!herokuTeamKey.trim() || !selectedHerokuTeam || isSavingHerokuTeam || isLoadingHerokuTeams}
                              onClick={saveHerokuTeam}
                            >
                              {isSavingHerokuTeam ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save team"}
                            </Button>
                          </div>
                          {teamLookupError && <p className="text-xs text-destructive">{teamLookupError}</p>}
                          <p className="text-xs text-muted-foreground">The team key becomes the active Heroku credential for new deployments and bot management.</p>
                        </CardContent>
                      </Card>

                      {/* Bot Stats */}
                      <Card className="border-border/40">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Bot className="h-4 w-4 text-primary" /> Bot Statistics
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                              { label: "Total", value: health.bots.total, color: "text-foreground" },
                              { label: "Online", value: health.bots.online, color: "text-emerald-400" },
                              { label: "Offline", value: health.bots.offline, color: "text-slate-400" },
                              { label: "Error", value: health.bots.error, color: "text-red-400" },
                              { label: "Suspended", value: health.bots.suspended, color: "text-amber-400" },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="text-center p-3 rounded-xl bg-muted/30 border border-border/40">
                                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                                <p className="text-xs text-muted-foreground mt-1">{label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Platform Uptime Rate</span>
                              <span className={`font-bold text-lg ${health.bots.uptimeRate >= 80 ? "text-emerald-400" : health.bots.uptimeRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                {health.bots.uptimeRate}%
                              </span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${health.bots.uptimeRate >= 80 ? "bg-emerald-500" : health.bots.uptimeRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${health.bots.uptimeRate}%` }} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Revenue */}
                      <Card className="border-border/40">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" /> Revenue & Payments
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                              <p className="text-2xl font-bold text-primary">
                                KES {((health.payments.totalRevenue ?? 0) / 100).toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                              <p className="text-2xl font-bold">
                                KES {((health.payments.totalWalletBalance ?? 0) / 100).toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Total Wallet Balance</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
                              <p className="text-2xl font-bold text-amber-400">{health.payments.pendingPayments}</p>
                              <p className="text-xs text-muted-foreground mt-1">Pending Payments</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <p className="text-xs text-muted-foreground text-right">
                        Last updated: {new Date(health.timestamp).toLocaleString()}
                      </p>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Template Edit Modal */}
        <AdminTemplateEditModal
          template={editingTemplate}
          open={showEditModal}
          onOpenChange={setShowEditModal}
          onSaved={() => queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() })}
        />

        <Dialog open={!!coinCreditUser} onOpenChange={(open) => { if (!open && !isCreditingCoins) setCoinCreditUser(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-amber-500" />Add coins to user</DialogTitle>
            </DialogHeader>
            {coinCreditUser && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="font-medium">{coinCreditUser.username}</p>
                  <p className="text-sm text-muted-foreground">{coinCreditUser.email}</p>
                  <p className="mt-2 text-sm">Current balance: <span className="font-semibold">{coinCreditUser.coinBalance} coins</span></p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-coin-amount" className="text-sm font-medium">Coins to add</label>
                  <Input id="admin-coin-amount" type="number" min="1" step="1" value={coinCreditAmount}
                    onChange={(event) => setCoinCreditAmount(event.target.value)} placeholder="Enter a whole number" />
                  <p className="text-xs text-muted-foreground">This will be recorded in the coin transaction history.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCoinCreditUser(null)} disabled={isCreditingCoins}>Cancel</Button>
                  <Button onClick={() => void handleCreditCoins()} disabled={isCreditingCoins || !coinCreditAmount.trim()}>
                    {isCreditingCoins ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coins className="mr-2 h-4 w-4" />}
                    Add coins
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bot Logs Modal */}
        <Dialog open={!!logsBot} onOpenChange={(v) => { if (!v) setLogsBot(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Logs: {logsBot?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="bg-[#060a10] rounded-xl h-[50vh] overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-0">
                  {isLoadingBotLogs ? (
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-mono">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading logs...
                    </div>
                  ) : botLogs.length === 0 ? (
                    <p className="text-slate-500 text-xs font-mono">No logs available.</p>
                  ) : (
                    botLogs.map((line, i) => <LogLine key={i} line={line} />)
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-2"
                onClick={() => logsBot && handleViewBotLogs(logsBot.id, logsBot.name)}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Layout>
    </ProtectedRoute>
  );
}
