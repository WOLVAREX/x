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
  ExternalLink, RefreshCw, KeyRound,
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
  const isError   = line.includes("ERROR") || line.includes("FATAL") || line.includes("error");
  const isSuccess = line.includes("successful") || line.includes("succeeded") || line.includes("deployed") || line.includes("live");
  const isWarning = line.includes("WARNING") || line.includes("warn");
  const isDivider = line.includes("--");
  return (
    <div className={`font-mono text-xs leading-6 px-1 ${
      isError ? "text-red-400" :
      isSuccess ? "text-emerald-400 font-medium" :
      isWarning ? "text-amber-400" :
      isDivider ? "text-slate-500 italic" :
      "text-slate-300"
    }`}>
      {line}
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

  const { data: deployment, isLoading } = useGetDeployment(id);

  useEffect(() => {
    if (deployment?.envVars) setEnvVars(deployment.envVars as Record<string, string>);
    if (deployment?.status) setDeployStatus(deployment.status);
  }, [deployment]);

  // Poll logs every 3s while building, every 30s when online
  useEffect(() => {
    if (!id || isNaN(id)) return;

    async function fetchLogs() {
      try {
        const res = await fetch(`${API_BASE}/api/deployments/${id}/logs`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        const lines: string[] = data.lines ?? [];
        setLogs(lines);
        setDeployStatus(data.status ?? "building");

        // Fetch live Heroku logs if online
        if (data.status === "online") {
          try {
            const hRes = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader() });
            if (hRes.ok) {
              const hData = await hRes.json();
              if (hData.lines?.length > 0) {
                setLogs([...lines, "", "-- Live Heroku Logs --", ...hData.lines]);
              }
            }
          } catch {}
        }
      } catch {}
    }

    fetchLogs();
    const isBuilding = deployStatus === "building";
    const interval = setInterval(fetchLogs, isBuilding ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [id, deployStatus]);

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
      const res = await fetch(`${API_BASE}/api/deployments/${id}/heroku-logs`, { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        const deployRes = await fetch(`${API_BASE}/api/deployments/${id}/logs`, { headers: authHeader() });
        const deployData = await deployRes.json();
        setLogs([...(deployData.lines ?? []), "", "-- Live Heroku Logs --", ...(data.lines ?? [])]);
        toast({ title: "Logs refreshed" });
      }
    } catch { toast({ title: "Could not refresh logs", variant: "destructive" }); }
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
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`https://${deployment.herokuAppId}.herokuapp.com`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View App
                </a>
              </Button>
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

            {!isBuilding && (
              <div className="flex gap-2">
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
              </div>
            )}
          </div>

          {/* ── Logs Tab ── */}
          <TabsContent value="logs" className="mt-4">
            <Card className="border-border/40">
              <CardHeader className="py-3 px-4 border-b border-border/40 flex flex-row items-center gap-2 space-y-0">
                <Terminal className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium flex-1">
                  {isBuilding ? "Deployment Logs" : "Live Bot Logs"}
                </CardTitle>
                {isBuilding && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> streaming
                  </span>
                )}
                {!isBuilding && (
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground"
                    onClick={handleRefreshLogs} disabled={isRefreshingLogs}>
                    <RefreshCw className={`h-3 w-3 ${isRefreshingLogs ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="bg-[#060a10] rounded-b-xl h-[60vh] relative overflow-hidden">
                  <ScrollArea className="h-full w-full">
                    <div className="p-5 space-y-0">
                      {logs.length === 0 ? (
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-mono">
                          <Loader2 className="h-3 w-3 animate-spin" /> Waiting for logs...
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
