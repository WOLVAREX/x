import { useState, useEffect, useRef } from "react";
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
      {status}
    </span>
  );
}

function LogLine({ line }: { line: string }) {
  if (!line || line.trim() === "") return <div className="h-2" />;
  const divider = line.match(/^--\s*(.*?)\s*--$/);
  if (divider) return <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-px flex-1 bg-slate-800" />{divider[1]}<span className="h-px flex-1 bg-slate-800" /></div>;
  const timestamp = line.match(/^\[(\d{4}-\d\d-\d\dT[^\]]+)\]\s*/)?.[1];
  const message = timestamp ? line.slice(line.indexOf("]") + 2) : line;
  const isError   = /\b(ERROR|FATAL|FAILED)\b/i.test(message);
  const isSuccess = /successful|succeeded|deployed|is running|bot is live/i.test(message);
  const isWarning = /\bWARNING\b/i.test(message);
  const time = timestamp ? new Date(timestamp) : null;
  return (
    <div className="group flex gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600 group-hover:bg-slate-400" />
      {time && !Number.isNaN(time.getTime()) && <time className="w-[4.5rem] shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-slate-500">{format(time, "HH:mm:ss")}</time>}
      <span className={`min-w-0 break-words font-mono text-xs leading-5 ${
        isError ? "text-red-400" : isSuccess ? "font-medium text-emerald-400" : isWarning ? "text-amber-400" : "text-slate-300"
      }`}>
        {message}
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

  const [logs, setLogs] = useState<string[]>([]);
  const [deployStatus, setDeployStatus] = useState("building");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [herokuStatusError, setHerokuStatusError] = useState<string | null>(null);

  const { data: deployment, isLoading } = useGetDeployment(id);

  useEffect(() => {
    if (deployment?.envVars) setEnvVars(deployment.envVars as Record<string, string>);
    if (deployment?.status) setDeployStatus(deployment.status);
  }, [deployment]);

  // Check Heroku's live dynos/build and refresh logs while a deployment is active.
  useEffect(() => {
    if (!id || isNaN(id)) return;

    async function fetchLogs() {
      let liveStatus: string | undefined;
      try {
        if (deployment?.herokuAppId) {
          try {
            const statusRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-status`, { headers: authHeader(), cache: "no-store" });
            const statusData = await statusRes.json();
            if (!statusRes.ok) throw new Error(statusData.error ?? "Could not read Heroku status");
            liveStatus = statusData.status;
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

        if (status === "online" && deployment?.herokuAppId) {
          try {
            const hRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader(), cache: "no-store" });
            const hData = await hRes.json();
            if (!hRes.ok) throw new Error(hData.error ?? "Could not fetch Heroku logs");
            setLogs(hData.lines?.length ? [...lines, "", "-- Heroku Runtime --", ...hData.lines] : lines);
          } catch (error) {
            setLogs(lines);
            setHerokuStatusError(error instanceof Error ? error.message : "Could not fetch Heroku runtime logs");
          }
        } else {
          setLogs(lines);
        }
      } catch {}
    }

    fetchLogs();
    const isBuilding = deployStatus === "building";
    const interval = setInterval(fetchLogs, isBuilding ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [id, deployStatus, deployment?.herokuAppId]);

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
        toast({ title: "Bot deleted from JXHP and Heroku" });
        setLocation("/my-bots");
      },
    },
  });

  async function handleRefreshLogs() {
    setIsRefreshingLogs(true);
    try {
      const statusRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-status`, { headers: authHeader(), cache: "no-store" });
      const statusData = await statusRes.json();
      if (statusRes.ok && statusData.status) setDeployStatus(statusData.status);
      const deployRes = await fetch(`${API_BASE}/api/deployments/${id}/logs`, { headers: authHeader(), cache: "no-store" });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error ?? "Could not read deployment events");
      if (statusData.status === "online") {
        const herokuRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader(), cache: "no-store" });
        const herokuData = await herokuRes.json();
        if (!herokuRes.ok) throw new Error(herokuData.error ?? "Could not read Heroku runtime logs");
        setLogs(herokuData.lines?.length ? [...(deployData.lines ?? []), "", "-- Heroku Runtime --", ...herokuData.lines] : deployData.lines ?? []);
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
        {deployStatus === "error" && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Deployment failed</p>
              <p className="text-xs text-muted-foreground">Check the logs below. You can edit your configuration and restart.</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => startMutation.mutate({ id })}>
              <Play className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        <Tabs defaultValue="logs">
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
                {deployStatus === "offline" || deployStatus === "error" || deployStatus === "suspended" ? (
                  <Button size="sm" variant="outline" className="gap-1.5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                    disabled={startMutation.isPending} onClick={() => startMutation.mutate({ id })}>
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
                  <CardDescription className="mt-0.5 text-xs">JuneX setup events and live Heroku runtime output</CardDescription>
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
                <CardDescription>Permanently deletes this bot from JXHP and Heroku. Cannot be undone.</CardDescription>
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
                        This permanently deletes the bot from JXHP and removes the Heroku app. Cannot be undone.
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
