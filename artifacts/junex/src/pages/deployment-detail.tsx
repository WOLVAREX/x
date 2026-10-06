import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useGetDeployment, useStartDeployment, useStopDeployment,
  useRestartDeployment, useDeleteDeployment,
  getGetDeploymentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Terminal, Play, Square, RotateCcw, Trash2,
  ArrowLeft, Save, CheckCircle2, AlertCircle, Bot,
  ExternalLink, RefreshCw, KeyRound, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";

function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    online:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    offline:   "bg-slate-500/15 text-slate-400 border-slate-500/20",
    error:     "bg-red-500/15 text-red-400 border-red-500/20",
    failed:    "bg-red-500/15 text-red-400 border-red-500/20",
    building:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
    expired:   "bg-amber-500/15 text-amber-400 border-amber-500/20",
    suspended: "bg-red-500/15 text-red-400 border-red-500/20",
    queued:    "bg-amber-500/15 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg[status] ?? cfg.offline}`}>
      {status === "building" ? <Loader2 className="h-3 w-3 animate-spin" /> :
       status === "online" ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> :
       <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
      {status === "online" ? "Dyno up" : status}
    </span>
  );
}

const ansiColor = (code: number): string | undefined => {
  const basic = ["#111827", "#ef4444", "#22c55e", "#eab308", "#3b82f6", "#a855f7", "#06b6d4", "#d1d5db"];
  const bright = ["#6b7280", "#f87171", "#4ade80", "#fde047", "#60a5fa", "#c084fc", "#22d3ee", "#ffffff"];
  if (code >= 30 && code <= 37) return basic[code - 30];
  if (code >= 90 && code <= 97) return bright[code - 90];
  if (code >= 40 && code <= 47) return basic[code - 40];
  if (code >= 100 && code <= 107) return bright[code - 100];
  return undefined;
};

function ansiSegments(input: string): Array<{ text: string; style: CSSProperties }> {
  const line = input
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^\d{4}-\d\d-\d\dT\S+\s+[^\s:]+(?:\[[^\]]+\])?:\s?/, "")
    .replace(/^(?:app|heroku)\[[^\]]+\]:\s?/, "")
    .replace(/\u001b\[([\d;]*)m|\ufffd\[([\d;]*)m|\\x1b\[([\d;]*)m|\\u001b\[([\d;]*)m/g, "§§$1$2$3$4§§")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const segments: Array<{ text: string; style: CSSProperties }> = [];
  let style: CSSProperties = {};
  const parts = line.split("§§");
  for (const [index, part] of parts.entries()) {
    if (index % 2 === 0) {
      if (part) segments.push({ text: part, style: { ...style } });
      continue;
    }
    const codes = (part || "0").split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) style = {};
      else if (code === 1) style.fontWeight = 700;
      else if (code === 2) style.opacity = 0.75;
      else if (code === 3) style.fontStyle = "italic";
      else if (code === 4) style.textDecoration = "underline";
      else if (code === 22) { delete style.fontWeight; delete style.opacity; }
      else if (code === 23) delete style.fontStyle;
      else if (code === 24) delete style.textDecoration;
      else if (code === 39) delete style.color;
      else if (code === 49) delete style.backgroundColor;
      else if (code === 38 || code === 48) {
        const property = code === 38 ? "color" : "backgroundColor";
        if (codes[i + 1] === 2 && codes.length >= i + 5) {
          style[property] = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`;
          i += 4;
        } else if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          const n = codes[i + 2];
          const cube = (v: number) => v === 0 ? 0 : 55 + 40 * v;
          const value = n < 16 ? ansiColor(n < 8 ? n + (code === 38 ? 30 : 40) : n + (code === 38 ? 82 : 92)) : n < 232
            ? `rgb(${cube(Math.floor((n - 16) / 36))}, ${cube(Math.floor(((n - 16) % 36) / 6))}, ${cube((n - 16) % 6)})`
            : `rgb(${8 + (n - 232) * 10}, ${8 + (n - 232) * 10}, ${8 + (n - 232) * 10})`;
          if (value) style[property] = value;
          i += 2;
        }
      } else {
        const color = ansiColor(code);
        if (color) style[code >= 40 && code <= 47 || code >= 100 && code <= 107 ? "backgroundColor" : "color"] = color;
      }
    }
  }
  return segments;
}

function LogLine({ line }: { line: string }) {
  if (!line || line.trim() === "") return <div className="h-1.5" />;
  const divider = line.match(/^--\s*(.*?)\s*--$/);
  if (divider) return <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-px flex-1 bg-slate-800" />{divider[1]}<span className="h-px flex-1 bg-slate-800" /></div>;
  const buildLog = /^\[(?:[^\]]+)\]\s+\[Heroku build\]\s/.test(line) || /^\[Heroku build\]\s/.test(line);
  const runtimeLog = /^\[(?:[^\]]+)\]\s+\[Heroku runtime\]\s/.test(line) || /^\[Heroku runtime\]\s/.test(line);
  const source = buildLog ? "Heroku build" : runtimeLog ? "Heroku" : "J.H.P";
  const visibleLine = line.replace(/^(?:\[[^\]]+\]\s+)?\[Heroku (?:build|runtime)\]\s/, "");
  const segments = ansiSegments(visibleLine);
  if (segments.length === 0) return null;
  return (
    <div className="group flex min-w-0 items-start gap-2 rounded-md px-2 py-1 hover:bg-white/[0.03]">
      <span className="mt-0.5 shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-sans text-[9px] font-semibold leading-none text-primary">J.H.P</span>
      {source !== "J.H.P" && <span className="mt-0.5 shrink-0 rounded border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 font-sans text-[9px] font-semibold leading-none text-sky-300">{source}</span>}
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-200">
        {segments.map((segment, index) => <span key={index} style={segment.style}>{segment.text}</span>)}
      </span>
    </div>
  );
}

export default function DeploymentDetail() {
  const params = useParams() as { id?: string };
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastRuntimeLogFetchRef = useRef(0);

  const [logs, setLogs] = useState<string[]>([]);
  const [deployStatus, setDeployStatus] = useState("building");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [showDatabaseUrl, setShowDatabaseUrl] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [herokuStatusError, setHerokuStatusError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [herokuDeletedAt, setHerokuDeletedAt] = useState<string | null>(null);

  const { data: deployment, isLoading } = useGetDeployment(id);

  useEffect(() => {
    if (deployment?.envVars) setEnvVars(deployment.envVars as Record<string, string>);
    if (deployment?.status) setDeployStatus(deployment.status);
    setFailureReason(deployment?.failureReason ?? null);
    setHerokuDeletedAt(deployment?.herokuDeletedAt ?? null);
  }, [deployment]);

  // Postgres is provisioned asynchronously during deployment. Refresh the
  // managed config value while the app is building so it appears without a reload.
  useEffect(() => {
    if (!deployment?.herokuAppId || deployment.databaseUrl || deployment.status !== "building") return;
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: getGetDeploymentQueryKey(id) });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [deployment?.herokuAppId, deployment?.databaseUrl, deployment?.status, id, queryClient]);

  // Check Heroku's live dynos/build and refresh logs while a deployment is active.
  useEffect(() => {
    if (!id || isNaN(id)) return;

    async function fetchLogs() {
      let liveStatus: string | undefined;
      let liveStatusData: any;
      try {
        if (deployment?.herokuAppId) {
          try {
            const statusRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-status`, { headers: authHeader(), cache: "no-store" });
            const statusData = await statusRes.json();
            if (!statusRes.ok) throw new Error(statusData.error ?? "Could not read Heroku status");
            liveStatus = statusData.status;
            liveStatusData = statusData;
            setFailureReason(statusData.failureReason ?? null);
            setHerokuDeletedAt(statusData.herokuDeletedAt ?? null);
            setHerokuStatusError(null);
          } catch (error) {
            setHerokuStatusError(error instanceof Error ? error.message : "Could not read Heroku status");
          }
        }

        const res = await fetch(`${API_BASE}/api/deployments/${id}/logs`, { headers: authHeader(), cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const status = liveStatus ?? data.status ?? "building";
        setDeployStatus(status);
        const lines: string[] = data.lines ?? [];

        const terminalStatus = status === "online" || status === "failed";
        const runtimeDynoAvailable = status === "building"
          && liveStatusData?.dynos?.some((dyno: { state?: string }) => ["starting", "up", "crashed"].includes((dyno.state ?? "").toLowerCase()));
        const shouldFetchRuntimeLogs = terminalStatus
          || (runtimeDynoAvailable && Date.now() - lastRuntimeLogFetchRef.current >= 15_000);
        if (shouldFetchRuntimeLogs && deployment?.herokuAppId && !herokuDeletedAt) {
          lastRuntimeLogFetchRef.current = Date.now();
          try {
            const hRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader(), cache: "no-store" });
            const hData = await hRes.json();
            if (!hRes.ok) throw new Error(hData.error ?? "Could not fetch Heroku logs");
            setLogs(hData.lines?.length ? [...lines, "", "-- Heroku runtime logs --", ...hData.lines] : lines);
          } catch (error) {
            setLogs(lines);
            setHerokuStatusError(error instanceof Error ? error.message : "Could not fetch Heroku runtime logs");
          }
        } else {
          setLogs(lines);
        }
      } catch (error) {
        setHerokuStatusError(error instanceof Error ? error.message : "Could not refresh deployment logs");
      }
    }

    fetchLogs();
    const isBuilding = deployStatus === "building";
    const interval = setInterval(fetchLogs, isBuilding ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [id, deployStatus, deployment?.herokuAppId, herokuDeletedAt]);

  // Auto scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetDeploymentQueryKey(id) });

  const startMutation = useStartDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot starting..." }); invalidate(); } } });
  const stopMutation = useStopDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot stopped" }); invalidate(); } } });
  const restartMutation = useRestartDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot restarting..." }); invalidate(); } } });
  const deleteMutation = useDeleteDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot deleted from J.H.P" });
        setLocation("/my-bots");
      },
    },
  });

  async function handleRefreshLogs() {
    setIsRefreshingLogs(true);
    try {
      const statusRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-status`, { headers: authHeader(), cache: "no-store" });
      const statusData = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusData.error ?? "Could not read Heroku status");
      if (statusRes.ok && statusData.status) setDeployStatus(statusData.status);
      if (statusRes.ok) {
        setFailureReason(statusData.failureReason ?? null);
        setHerokuDeletedAt(statusData.herokuDeletedAt ?? null);
      }
      const deployRes = await fetch(`${API_BASE}/api/deployments/${id}/logs`, { headers: authHeader(), cache: "no-store" });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error ?? "Could not read deployment events");
      const terminalStatus = statusData.status === "online" || statusData.status === "failed";
      const runtimeDynoAvailable = statusData.status === "building"
        && statusData.dynos?.some((dyno: { state?: string }) => ["starting", "up", "crashed"].includes((dyno.state ?? "").toLowerCase()));
      if ((terminalStatus || runtimeDynoAvailable) && !statusData.herokuDeletedAt) {
        const herokuRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader(), cache: "no-store" });
        const herokuData = await herokuRes.json();
        if (!herokuRes.ok) throw new Error(herokuData.error ?? "Could not read Heroku runtime logs");
        setLogs(herokuData.lines?.length ? [...(deployData.lines ?? []), "", "-- Heroku runtime logs --", ...herokuData.lines] : deployData.lines ?? []);
      } else setLogs(deployData.lines ?? []);
      setHerokuStatusError(null);
      toast({ title: "Heroku status and logs refreshed" });
    } catch (error) { toast({ title: "Could not refresh Heroku data", description: error instanceof Error ? error.message : "Try again shortly.", variant: "destructive" }); }
    finally { setIsRefreshingLogs(false); }
  }

  async function handleSaveEnv() {
    setIsSavingEnv(true);
    try {
      const res = await fetch(`${API_BASE}/api/deployments/${id}/env`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ envVars }),
      });
      if (!res.ok) { toast({ title: "Failed to save", variant: "destructive" }); return; }
      toast({ title: "Configuration saved and pushed to Heroku" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setIsSavingEnv(false); }
  }

  async function handleSaveAndRestart() {
    setIsSavingEnv(true);
    try {
      // Save env vars first
      const res = await fetch(`${API_BASE}/api/deployments/${id}/env`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ envVars }),
      });
      if (!res.ok) { toast({ title: "Failed to save config", variant: "destructive" }); return; }
      // Then restart
      await fetch(`${API_BASE}/api/deployments/${id}/restart`, { method: "POST", headers: authHeader() });
      toast({ title: "Configuration saved and bot restarted on Heroku!" });
      invalidate();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setIsSavingEnv(false); }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!deployment) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Deployment not found.</p>
          <Button variant="link" asChild><Link href="/my-bots">Back to My Bots</Link></Button>
        </div>
      </Layout>
    );
  }

  const isBuilding = deployStatus === "building";

  return (
    <Layout>
      <div className="container max-w-5xl px-4 py-8 mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/my-bots"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{deployment.botName}</h1>
              <p className="text-xs text-muted-foreground">
                {deployment.templateName} &nbsp;·&nbsp; {format(new Date(deployment.createdAt), "MMM d, yyyy · h:mm a")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={deployStatus} />
            {deployment.herokuAppId && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigator.clipboard.writeText(deployment.herokuAppId!).then(() => toast({ title: "App name copied", description: "Keep it to recover this bot later." })).catch(() => toast({ title: "Could not copy app name", variant: "destructive" }))}><Copy className="h-3.5 w-3.5" /> Copy app name</Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild><a href={`https://${deployment.herokuAppId}.herokuapp.com`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> View App</a></Button>
              </div>
            )}
          </div>
        </div>

        {deployment.herokuAppId && (
          <p className="-mt-3 text-xs text-muted-foreground">Runtime status comes from Heroku dynos. J.H.P cannot verify the WhatsApp session.</p>
        )}

        {/* Building banner */}
        {isBuilding && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
            <Loader2 className="h-5 w-5 text-blue-400 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-400">Deployment in progress</p>
              <p className="text-xs text-muted-foreground">Your bot is being deployed to Heroku. This usually takes 2-5 minutes.</p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {(deployStatus === "error" || deployStatus === "failed") && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">{herokuDeletedAt ? "Heroku app removed" : "Heroku reports failure"}</p>
      <p className="text-xs text-muted-foreground">{failureReason ?? "Heroku reports that the bot process is not running."}</p>
            </div>
            {herokuDeletedAt ? (
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0 border-amber-500/30 text-amber-300 hover:bg-amber-500/10" asChild>
                <Link href={`/recover?appName=${encodeURIComponent(deployment.herokuAppId ?? deployment.botName)}`}>Recover bot</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => startMutation.mutate({ id })}>
                <Play className="h-3.5 w-3.5" /> Retry
              </Button>
            )}
          </div>
        )}

        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") === "config" ? "config" : "logs"}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="logs" className="gap-2">
                <Terminal className="h-4 w-4" /> Logs
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2">
                <KeyRound className="h-4 w-4" /> Configuration
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              {!isBuilding && <>
                {deployStatus === "offline" || deployStatus === "error" || deployStatus === "failed" || deployStatus === "suspended" ? (
                  <Button size="sm" variant="outline" className="gap-1.5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                    disabled={startMutation.isPending || Boolean(herokuDeletedAt)} onClick={() => startMutation.mutate({ id })}>
                    <Play className="h-3.5 w-3.5" /> Start
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
                    disabled={stopMutation.isPending || deployStatus !== "online"} onClick={() => stopMutation.mutate({ id })}>
                    <Square className="h-3.5 w-3.5" /> Stop
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5"
                  disabled={restartMutation.isPending || deployStatus !== "online"} onClick={() => restartMutation.mutate({ id })}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restart
                </Button>
              </>}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRefreshLogs} disabled={isRefreshingLogs}>
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} /> Check Heroku
              </Button>
            </div>
          </div>

          {/* ── Logs Tab ── */}
          <TabsContent value="logs" className="mt-4">
            <Card className="border-border/40">
              <CardHeader className="flex flex-row items-center gap-3 border-b border-border/40 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Terminal className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm font-medium">Deployment activity</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">J.H.P deployment activity and colorized bot output</CardDescription>
                </div>
                {isBuilding && (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking Heroku
                  </span>
                )}
              </CardHeader>
              {herokuStatusError && <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">Heroku status check: {herokuStatusError}</div>}
              <CardContent className="p-0">
                <div className="relative h-[60vh] overflow-hidden rounded-b-xl bg-[#080d14]">
                  <ScrollArea className="h-full w-full">
                    <div className="space-y-0 p-4 sm:p-5">
                      {logs.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-4 font-mono text-xs text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" /> Waiting for deployment activity…
                        </div>
                      ) : (
                        logs.map((line, i) => <LogLine key={i} line={line} />)
                      )}
                      <div ref={logsEndRef} className="h-2" />
                    </div>
                  </ScrollArea>
                  <div className="absolute top-0 left-0 w-full h-6 bg-gradient-to-b from-[#060a10] to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#060a10] to-transparent pointer-events-none" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Configuration Tab ── */}
          <TabsContent value="config" className="mt-4 space-y-5">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" /> Environment Variables
                </CardTitle>
                <CardDescription>
                  Edit your bot configuration below. Changes are pushed directly to Heroku.
                  Use "Save & Restart" to apply changes immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {deployment?.databaseUrl && (
                  <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
                    <div>
                      <p className="text-sm font-medium">Heroku Postgres</p>
                      <p className="text-xs text-muted-foreground">Managed by Heroku and kept separate from editable bot variables.</p>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1 truncate rounded-md border border-border/40 bg-muted px-3 py-2 font-mono text-xs" title={showDatabaseUrl ? deployment.databaseUrl : undefined}>
                        {showDatabaseUrl ? deployment.databaseUrl : "••••••••••••••••••••••••••••••••"}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowDatabaseUrl((visible) => !visible)}>
                        {showDatabaseUrl ? "Hide" : "Show"}
                      </Button>
                      <Button variant="outline" size="icon" aria-label="Copy database URL" onClick={() => navigator.clipboard.writeText(deployment.databaseUrl!).then(() => toast({ title: "Database URL copied" })).catch(() => toast({ title: "Could not copy database URL", variant: "destructive" }))}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="break-all font-mono text-[10px] text-muted-foreground">Config key: DATABASE_URL</p>
                  </div>
                )}
                {deployment && !deployment.databaseUrl && (
                  <p className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Heroku Postgres is still provisioning or is not attached to this app. DATABASE_URL will appear here when Heroku provides it.
                  </p>
                )}
                {Object.entries(envVars).length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No environment variables set.</p>
                )}
                {Object.entries(envVars).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-1/3 flex-shrink-0">
                      <div className="bg-muted border border-border/40 rounded-md px-3 py-2 font-mono text-xs text-primary">
                        {key}
                      </div>
                    </div>
                    <Input
                      value={val}
                      onChange={(e) => setEnvVars({ ...envVars, [key]: e.target.value })}
                      className="flex-1 font-mono text-xs"
                      placeholder={`Value for ${key}`}
                    />
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={() => { const n = { ...envVars }; delete n[key]; setEnvVars(n); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {/* Add new variable */}
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground">Add new variable</p>
                <div className="flex items-center gap-2">
                  <Input placeholder="KEY" value={newKey}
                    onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                    className="w-1/3 font-mono text-xs flex-shrink-0" />
                  <Input placeholder="VALUE" value={newVal}
                    onChange={(e) => setNewVal(e.target.value)}
                    className="flex-1 font-mono text-xs" />
                  <Button variant="secondary" size="sm" className="flex-shrink-0"
                    onClick={() => {
                      if (newKey && newVal) {
                        setEnvVars({ ...envVars, [newKey]: newVal });
                        setNewKey(""); setNewVal("");
                      }
                    }}>
                    Add
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border/40 justify-between py-4 gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">Variables are encrypted and stored securely on Heroku.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleSaveEnv} disabled={isSavingEnv}>
                    {isSavingEnv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Only
                  </Button>
                  <Button size="sm" className="gap-2" onClick={handleSaveAndRestart} disabled={isSavingEnv}>
                    {isSavingEnv ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Save & Restart
                  </Button>
                </div>
              </CardFooter>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
                <CardDescription>Permanently deletes this bot from J.H.P and removes its hosting app. Cannot be undone.</CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" /> Delete Bot
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {deployment.botName}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the bot from J.H.P and removes its hosting app. Cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground"
                        onClick={() => deleteMutation.mutate({ id })}>
                        Yes, Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
