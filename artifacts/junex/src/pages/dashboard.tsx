import { useState, useEffect } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetDashboardSummary,
  useStartDeployment,
  useStopDeployment,
  useRestartDeployment,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  Loader2, Server, AlertCircle, Terminal, Play, Square,
  RotateCcw, Plus, CheckCircle2, XCircle, Clock, Wallet, Coins,
  ArrowRight, Bot, Activity, Zap, TrendingUp, Copy,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";

function authHeader() {
  const token = localStorage.getItem("JuneXHostingPlatform_token");
  return { Authorization: `Bearer ${token}` };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; dot: string }> = {
    online:    { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
    offline:   { className: "bg-slate-500/15 text-slate-400 border-slate-500/20", dot: "bg-slate-400" },
    error:     { className: "bg-red-500/15 text-red-400 border-red-500/20", dot: "bg-red-400" },
    failed:    { className: "bg-red-500/15 text-red-400 border-red-500/20", dot: "bg-red-400" },
    building:  { className: "bg-blue-500/15 text-blue-400 border-blue-500/20", dot: "" },
    queued:    { className: "bg-amber-500/15 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
    suspended: { className: "bg-red-500/15 text-red-400 border-red-500/20", dot: "bg-red-400" },
  };
  const { className, dot } = config[status] ?? config.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {status === "building"
        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
        : <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      }
      {status}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "online") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-red-400" />;
  if (status === "building") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  return <XCircle className="h-4 w-4 text-slate-400" />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 30_000 } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/wallet`, { headers: authHeader() })
      .then(r => r.json())
      .then(d => { setWalletBalance(d.balance ?? 0); })
      .catch(() => setWalletBalance(0));
  }, []);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });

  const startMutation = useStartDeployment({
    mutation: { onSuccess: () => { toast({ title: "Bot starting..." }); invalidate(); } },
  });
  const stopMutation = useStopDeployment({
    mutation: { onSuccess: () => { toast({ title: "Bot stopped" }); invalidate(); } },
  });
  const restartMutation = useRestartDeployment({
    mutation: { onSuccess: () => { toast({ title: "Bot restarting..." }); invalidate(); } },
  });

  const firstName = user?.username?.split("_")[0] ?? user?.username ?? "there";

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container px-4 md:px-8 py-6 md:py-10 mx-auto max-w-6xl space-y-8">

          {/* ── Welcome banner ── */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{getGreeting()},</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight capitalize">
                  {firstName}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  {summary?.totalDeployments
                    ? `You have ${summary.totalDeployments} bot${summary.totalDeployments !== 1 ? "s" : ""} deployed — ${summary.onlineCount} online`
                    : "Welcome to J.H.P. Deploy your first bot to get started."}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <Link href="/wallet">
                    <Coins className="h-4 w-4" />
                    {walletBalance !== null ? `${walletBalance.toLocaleString()} coins` : "Wallet"}
                  </Link>
                </Button>
                <Button size="sm" className="gap-2" asChild>
                  <Link href="/templates">
                    <Plus className="h-4 w-4" /> Deploy New Bot
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : summary ? (
            <>
              {/* ── Stat cards ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[
                  {
                    label: "Total Bots",
                    value: summary.totalDeployments,
                    icon: Bot,
                    color: "text-primary",
                    bg: "bg-primary/10",
                  },
                  {
                    label: "Online",
                    value: summary.onlineCount,
                    icon: Activity,
                    color: "text-emerald-400",
                    bg: "bg-emerald-500/10",
                  },
                  {
                    label: "Offline",
                    value: summary.offlineCount,
                    icon: Server,
                    color: "text-slate-400",
                    bg: "bg-slate-500/10",
                  },
                  {
                    label: "Errors",
                    value: summary.errorCount,
                    icon: AlertCircle,
                    color: "text-red-400",
                    bg: "bg-red-500/10",
                  },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <Card key={label} className="border-border/40 hover:border-primary/20 transition-colors">
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center`}>
                          <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                      </div>
                      <p className="text-2xl md:text-3xl font-bold">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Wallet balance strip ── */}
              <Card className="border-border/40">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Coin Balance</p>
                      <p className="text-xl font-bold text-primary">
                        {walletBalance !== null ? `${walletBalance.toLocaleString()} coins` : <Loader2 className="h-4 w-4 animate-spin inline" />}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <Link href="/wallet"><Plus className="h-3.5 w-3.5" /> Add Funds</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2 hidden sm:flex" asChild>
                      <Link href="/wallet">History <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── Bots ── */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Your Bots</h2>
                  {summary.totalDeployments > 3 && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
                      <Link href="/my-bots">More bots <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  )}
                </div>

                {summary.recentDeployments.length === 0 ? (
                  <Card className="border-dashed border-border/60">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
                      <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
                        <Terminal className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-base font-semibold">No bots deployed yet</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xs">
                        Browse our template library and deploy your first Discord bot in minutes.
                      </p>
                      <Button className="gap-2" asChild>
                        <Link href="/templates"><Zap className="h-4 w-4" /> Browse Templates</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {summary.recentDeployments.slice(0, 3).map((deployment) => (
                      <Card
                        key={deployment.id}
                        className="flex flex-col border-border/40 hover:border-primary/25 transition-all hover:shadow-md group"
                      >
                        <CardHeader className="pb-3 p-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/30 group-hover:bg-primary/15 transition-colors">
                                {deployment.templateThumbnail ? <img src={deployment.templateThumbnail} alt={deployment.templateName} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.removeProperty("display"); }} /> : null}
                                <Bot className="h-4 w-4 text-primary" style={{ display: deployment.templateThumbnail ? "none" : undefined }} />
                              </div>
                              <div className="min-w-0">
                                <CardTitle className="text-sm leading-snug">
                                  <Link
                                    href={`/deployments/${deployment.id}`}
                                    className="hover:text-primary transition-colors truncate block"
                                  >
                                    {deployment.botName}
                                  </Link>
                                </CardTitle>
                                <CardDescription className="text-xs truncate mt-0.5">
                                  {deployment.templateName}
                                </CardDescription>
                              </div>
                            </div>
                            <StatusBadge status={deployment.status} />
                          </div>
                        </CardHeader>

                        {deployment.herokuDeletedAt && (
                          <CardContent className="pt-0">
                            <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                              <p className="font-semibold">Bot needs recovery</p>
                              <p className="mt-1 text-amber-100/80">{deployment.failureReason ?? "The bot session failed"}. Its Heroku app was removed. Recover it to redeploy.</p>
                              <Button asChild size="sm" variant="outline" className="mt-2 h-8 border-amber-500/40 text-amber-100 hover:bg-amber-500/15">
                                <Link href={`/recover?appName=${encodeURIComponent(deployment.herokuAppId ?? deployment.botName)}`}>Recover bot</Link>
                              </Button>
                            </div>
                          </CardContent>
                        )}

                        <CardContent className="flex-1 px-5 pb-0">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Deployed {format(new Date(deployment.createdAt), "MMM d, yyyy")}
                          </div>
                          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Server className="h-3 w-3 shrink-0" />
                            <span className="shrink-0">App:</span>
                            <span className="min-w-0 truncate font-mono text-[11px] text-foreground/80">{deployment.herokuAppId ?? "Assigning name…"}</span>
                            {deployment.herokuAppId && <Button variant="ghost" size="icon" aria-label="Copy app name" className="ml-auto h-6 w-6 shrink-0" onClick={() => navigator.clipboard.writeText(deployment.herokuAppId!).then(() => toast({ title: "App name copied" })).catch(() => toast({ title: "Could not copy app name", variant: "destructive" }))}><Copy className="h-3 w-3" /></Button>}
                          </div>
                        </CardContent>

                        <div className="p-4 mt-4 border-t border-border/40 flex gap-2">
                          {deployment.status === "offline" || deployment.status === "error" || deployment.status === "failed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 text-emerald-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                              disabled={startMutation.isPending || Boolean(deployment.herokuDeletedAt)}
                              onClick={() => startMutation.mutate({ id: deployment.id })}
                            >
                              <Play className="h-3.5 w-3.5" /> Start
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 text-red-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
                              disabled={stopMutation.isPending || deployment.status !== "online"}
                              onClick={() => stopMutation.mutate({ id: deployment.id })}
                            >
                              <Square className="h-3.5 w-3.5" /> Stop
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5"
                            disabled={restartMutation.isPending || deployment.status !== "online"}
                            onClick={() => restartMutation.mutate({ id: deployment.id })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restart
                          </Button>
                          <Button size="sm" variant="secondary" asChild className="px-3">
                            <Link href={`/deployments/${deployment.id}`}>View</Link>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Quick links ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="border-border/40 hover:border-primary/20 transition-colors group cursor-pointer" onClick={() => window.location.href = "/templates"}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">Browse Templates</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Deploy a new bot from our library</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </CardContent>
                </Card>

                <Card className="border-border/40 hover:border-primary/20 transition-colors group cursor-pointer" onClick={() => window.location.href = "/wallet"}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">Wallet & Payments</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Top up balance, view transactions</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}


