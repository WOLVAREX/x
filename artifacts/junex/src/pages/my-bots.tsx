import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Loader2, Search, Bot, Play, Square, RotateCcw,
  Terminal, ExternalLink, Trash2, Plus, AlertCircle,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useListDeployments, useStartDeployment, useStopDeployment,
  useRestartDeployment, useDeleteDeployment,
  getListDeploymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    online:    { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> },
    offline:   { cls: "bg-slate-500/15 text-slate-400 border-slate-500/20", icon: <XCircle className="h-3 w-3" /> },
    error:     { cls: "bg-red-500/15 text-red-400 border-red-500/20", icon: <AlertCircle className="h-3 w-3" /> },
    building:  { cls: "bg-blue-500/15 text-blue-400 border-blue-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    suspended: { cls: "bg-red-500/15 text-red-400 border-red-500/20", icon: <XCircle className="h-3 w-3" /> },
    queued:    { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
  };
  const { cls, icon } = cfg[status] ?? cfg.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {icon} {status}
    </span>
  );
}

export default function MyBotsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: deployments, isLoading } = useListDeployments();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDeploymentsQueryKey() });

  const startMutation = useStartDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot starting..." }); invalidate(); } } });
  const stopMutation = useStopDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot stopped" }); invalidate(); } } });
  const restartMutation = useRestartDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot restarting..." }); invalidate(); } } });
  const deleteMutation = useDeleteDeployment({ mutation: { onSuccess: () => { toast({ title: "Bot deleted" }); invalidate(); } } });

  const filtered = (deployments ?? []).filter(d =>
    search === "" ||
    d.botName.toLowerCase().includes(search.toLowerCase()) ||
    d.templateName.toLowerCase().includes(search.toLowerCase()) ||
    d.status.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = (deployments ?? []).filter(d => d.status === "online").length;

  return (
    <Layout>
      <div className="container max-w-6xl px-4 py-8 mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Bots</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {deployments?.length ?? 0} bot{(deployments?.length ?? 0) !== 1 ? "s" : ""} deployed
              {onlineCount > 0 && ` â€” ${onlineCount} online`}
            </p>
          </div>
          <Button className="gap-2" asChild>
            <Link href="/templates"><Plus className="h-4 w-4" /> Deploy New Bot</Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bots by name, template or status..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-2xl border-border/60">
            <Bot className="h-14 w-14 text-muted-foreground/20 mb-4" />
            {search ? (
              <>
                <p className="font-medium text-muted-foreground">No bots match "{search}"</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>Clear search</Button>
              </>
            ) : (
              <>
                <p className="font-semibold">No bots deployed yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Browse templates and deploy your first bot.</p>
                <Button className="gap-2" asChild>
                  <Link href="/templates"><Plus className="h-4 w-4" /> Browse Templates</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((dep) => (
              <Card key={dep.id} className="border-border/40 hover:border-primary/25 hover:shadow-md transition-all group flex flex-col">
                <CardContent className="p-4 flex flex-col flex-1 gap-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/30 group-hover:bg-primary/15 transition-colors">
                        {dep.templateThumbnail ? (
                          <img
                            src={dep.templateThumbnail}
                            alt={dep.templateName}
                            className="h-full w-full object-cover rounded-xl"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              img.style.display = "none";
                              const fb = img.nextElementSibling as HTMLElement | null;
                              if (fb) fb.style.removeProperty("display");
                            }}
                          />
                        ) : null}
                        <Bot
                          className="h-5 w-5 text-primary/60"
                          style={{ display: dep.templateThumbnail ? "none" : undefined }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{dep.botName}</p>
                        <p className="text-xs text-muted-foreground truncate">{dep.templateName}</p>
                      </div>
                    </div>
                    <StatusBadge status={dep.status} />
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {format(new Date(dep.createdAt), "MMM d, yyyy")}
                    </span>
                    {dep.herokuAppId && (
                      <a href={`https://${dep.herokuAppId}.herokuapp.com`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary transition-colors">
                        <ExternalLink className="h-3 w-3" /> heroku
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-3 border-t border-border/40">
                    {dep.status === "offline" || dep.status === "error" ? (
                      <Button size="sm" variant="outline"
                        className="flex-1 gap-1.5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                        disabled={startMutation.isPending}
                        onClick={() => startMutation.mutate({ id: dep.id })}>
                        <Play className="h-3.5 w-3.5" /> Start
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline"
                        className="flex-1 gap-1.5 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
                        disabled={stopMutation.isPending || dep.status !== "online"}
                        onClick={() => stopMutation.mutate({ id: dep.id })}>
                        <Square className="h-3.5 w-3.5" /> Stop
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1.5"
                      disabled={restartMutation.isPending || dep.status !== "online"}
                      onClick={() => restartMutation.mutate({ id: dep.id })}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="secondary" className="gap-1.5" asChild>
                      <Link href={`/deployments/${dep.id}`}><Terminal className="h-3.5 w-3.5" /> Logs</Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 px-2">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {dep.botName}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes the bot and removes it from Heroku. Cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteMutation.mutate({ id: dep.id })}>
                            Yes, Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
