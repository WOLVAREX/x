import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Bot, Check, ChevronDown, Clock, Loader2, RotateCcw, Search, Settings2, WandSparkles } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Plan = { id: string; name: string; days: number; coins: number };
type RecoveryInfo = {
  id: number; appName: string; botName: string; templateId: number; templateName: string;
  envVars: Record<string, string>; fields: Record<string, { description?: string; required?: boolean }>;
  daysLeft: number; expiresAt: string | null; sources: Array<{ id: number; botName: string; templateName: string }>;
};
const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("junex_token")}` });

export default function RecoverPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [appName, setAppName] = useState("");
  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [sourceId, setSourceId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const requiredFields = Object.entries(recovery?.fields ?? {}).filter(([, field]) => field.required !== false);
  const optionalFields = Object.entries(recovery?.fields ?? {}).filter(([, field]) => field.required === false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault(); setIsLookingUp(true); setRecovery(null); setSourceId("");
    try {
      const response = await fetch(`${API_BASE}/api/recovery/lookup?appName=${encodeURIComponent(appName)}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not find that bot");
      setRecovery(data); setEnvVars(data.envVars ?? {});
      if (data.daysLeft <= 0) {
        const plansResponse = await fetch(`${API_BASE}/api/plans`);
        const plansData = await plansResponse.json();
        setPlans(plansData.plans ?? []); setPlanId(plansData.plans?.[0]?.id ?? "");
      }
    } catch (error) { toast({ title: "Bot not found", description: error instanceof Error ? error.message : "Check the app name and try again.", variant: "destructive" }); }
    finally { setIsLookingUp(false); }
  }

  async function chooseSource(value: string) {
    setSourceId(value);
    if (!value) { setEnvVars(recovery?.envVars ?? {}); return; }
    try {
      const response = await fetch(`${API_BASE}/api/recovery/source/${value}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load saved bot configuration");
      setEnvVars(data.envVars ?? {});
      toast({ title: `Loaded configuration from ${data.botName}` });
    } catch (error) { toast({ title: "Could not load configuration", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
  }

  async function recoverBot() {
    if (!recovery) return;
    setIsRecovering(true);
    try {
      const response = await fetch(`${API_BASE}/api/recovery`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ appName: recovery.appName, envVars, sourceDeploymentId: sourceId || undefined, planId: recovery.daysLeft <= 0 ? planId : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not recover this bot");
      toast({ title: "Bot recovery started", description: `Rebuilding ${data.appName} with your saved app name.` });
      navigate(`/deployments/${data.id}`);
    } catch (error) { toast({ title: "Recovery failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setIsRecovering(false); }
  }

  return <Layout><div className="container mx-auto max-w-3xl px-4 py-8 sm:py-10">
    <Button variant="ghost" size="sm" className="mb-4" asChild><Link href="/my-bots"><ArrowLeft className="mr-1 h-4 w-4" /> My Bots</Link></Button>
    <div className="mb-6"><Badge variant="outline" className="mb-3 gap-1.5"><RotateCcw className="h-3.5 w-3.5 text-primary" /> Bot recovery</Badge><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Recover a bot</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Paste the app name saved from deployment. J.H.P will restore its template and remaining plan time.</p></div>
    <Card className="border-border/60"><CardHeader><CardTitle>Find your archived bot</CardTitle><CardDescription>Use the app name from My Bots, for example jxhp-123-my-bot.</CardDescription></CardHeader><CardContent>
      <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row"><Input required value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="Heroku app name" className="font-mono" /><Button type="submit" disabled={isLookingUp} className="gap-2">{isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find bot</Button></form>
    </CardContent></Card>

    {recovery && <div className="mt-5 space-y-5">
      <Card className="border-primary/20 bg-primary/5"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div><div className="min-w-0"><h2 className="truncate font-semibold">{recovery.botName}</h2><p className="truncate text-sm text-muted-foreground">{recovery.templateName} · <code>{recovery.appName}</code></p></div></div><Badge variant={recovery.daysLeft > 0 ? "default" : "destructive"} className="w-fit gap-1.5">{recovery.daysLeft > 0 ? <Clock className="h-3.5 w-3.5" /> : null}{recovery.daysLeft > 0 ? `${recovery.daysLeft} days remaining` : "Plan expired"}</Badge></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Bot configuration</CardTitle><CardDescription>Use the saved values or load them from one of your other bots, then update what changed.</CardDescription></CardHeader><CardContent className="space-y-4">
        {recovery.sources.length > 0 && <div className="space-y-1.5"><Label htmlFor="source-bot">Copy configuration from another bot</Label><select id="source-bot" value={sourceId} onChange={(event) => void chooseSource(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Keep this bot’s saved configuration</option>{recovery.sources.map((source) => <option key={source.id} value={source.id}>{source.botName} · {source.templateName}</option>)}</select></div>}
        {Object.entries(recovery.fields).length ? <div className="space-y-4">
          {requiredFields.length > 0 && <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required variables</p>
            {requiredFields.map(([key, field]) => <div key={key} className="space-y-1.5"><Label htmlFor={`recover-${key}`}>{key}<span className="ml-1 text-destructive">*</span></Label>{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}<Input id={`recover-${key}`} value={envVars[key] ?? ""} onChange={(event) => setEnvVars((current) => ({ ...current, [key]: event.target.value }))} className="font-mono" /></div>)}
          </section>}
          {optionalFields.length > 0 && <details className="group rounded-lg border border-border/60 px-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span>More variables <span className="font-normal text-muted-foreground">({optionalFields.length} optional)</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t border-border/60 pb-3 pt-4">
              {optionalFields.map(([key, field]) => <div key={key} className="space-y-1.5"><Label htmlFor={`recover-${key}`}>{key}<span className="ml-1 text-muted-foreground">(optional)</span></Label>{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}<Input id={`recover-${key}`} value={envVars[key] ?? ""} onChange={(event) => setEnvVars((current) => ({ ...current, [key]: event.target.value }))} className="font-mono" /></div>)}
            </div>
          </details>}
        </div> : <p className="text-sm text-muted-foreground">This template has no environment variables to configure.</p>}
        {recovery.daysLeft <= 0 && <div className="space-y-1.5"><Label htmlFor="renew-plan">Select a plan to renew</Label><select id="renew-plan" value={planId} onChange={(event) => setPlanId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.days} days · {plan.coins} coins</option>)}</select></div>}
        <Button className="w-full gap-2" disabled={isRecovering || (recovery.daysLeft <= 0 && !planId)} onClick={() => void recoverBot()}>{isRecovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{isRecovering ? "Recovering bot…" : "Recover bot"}</Button>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Recovery recreates the deleted Heroku app with its original app name. Remaining days carry over; expired plans require a new plan.</p>
      </CardContent></Card>
    </div>}
  </div></Layout>;
}
