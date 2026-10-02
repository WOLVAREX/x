import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import type { Template } from "@workspace/api-client-react";
import {
  Loader2, Github, ArrowLeft, Bot, Users, Zap, KeyRound, Gift, Coins, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type HostingPlan = { id: string; name: string; days: number; coins: number };

function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

/** Injects / updates a <meta> tag in <head>. */
function setMeta(property: string, content: string) {
  const attr = property.startsWith("og:") || property.startsWith("twitter:") ? "property" : "name";
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(property: string) {
  const attr = property.startsWith("og:") || property.startsWith("twitter:") ? "property" : "name";
  document.querySelector(`meta[${attr}="${property}"]`)?.remove();
}

export default function TemplateDetail() {
  const params = useParams<{ id: string }>();
  const slugOrId = params.id ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Accept both numeric IDs (legacy) and slug strings
  const { data: template, isLoading } = useQuery<Template & { deployCount?: number }>({
    queryKey: ["template", slugOrId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/${encodeURIComponent(slugOrId)}`, {
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Template not found");
      return res.json();
    },
    enabled: !!slugOrId,
    retry: false,
  });

  const [botName, setBotName] = useState("");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [coinBalance, setCoinBalance] = useState<number>(0);
  const [isLoadingCoins, setIsLoadingCoins] = useState(true);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const { data: planData } = useQuery<{ plans: HostingPlan[]; coinsPerKes: number }>({ queryKey: ["hosting-plans"], queryFn: async () => { const response = await fetch("/api/plans"); if (!response.ok) throw new Error("Could not load hosting plans"); return response.json(); } });
  const plans = planData?.plans ?? [];
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];

  // Inject OG / Twitter meta tags while the page is mounted
  useEffect(() => {
    if (!template) return;
    const url = window.location.href;
    document.title = `${template.name} — J.H.P`;
    setMeta("og:title", template.name);
    setMeta("og:description", template.description);
    setMeta("og:url", url);
    setMeta("og:type", "website");
    if (template.thumbnail) setMeta("og:image", template.thumbnail);
    setMeta("twitter:card", template.thumbnail ? "summary_large_image" : "summary");
    setMeta("twitter:title", template.name);
    setMeta("twitter:description", template.description);
    if (template.thumbnail) setMeta("twitter:image", template.thumbnail);
    setMeta("description", template.description);

    return () => {
      // Restore defaults when navigating away
      document.title = "J.H.P";
      ["og:title","og:description","og:url","og:type","og:image",
       "twitter:card","twitter:title","twitter:description","twitter:image","description"]
        .forEach(removeMeta);
    };
  }, [template]);

  useEffect(() => {
    if (!template) return;
    setIsLoadingCoins(true);
    fetch("/api/wallet", { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => setCoinBalance(d.balance ?? 0))
      .catch(() => setCoinBalance(0))
      .finally(() => setIsLoadingCoins(false));
  }, [template]);

  function validateForm(): boolean {
    if (!botName.trim()) { toast({ title: "Bot name is required", variant: "destructive" }); return false; }
    const env = template?.appJson?.env as Record<string, { required?: boolean }> | undefined;
    for (const [key, config] of Object.entries(env ?? {})) {
      if (config.required !== false && !envVars[key]?.trim()) {
        toast({ title: `${key} is required`, variant: "destructive" }); return false;
      }
    }
    return true;
  }

  function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm() || !template) return;
    if (!plans.length) { toast({ title: "Hosting plans are unavailable", variant: "destructive" }); return; }
    setSelectedPlanId(plans[0].id);
    setIsPlanDialogOpen(true);
  }

  async function confirmDeploy() {
    if (!template || !selectedPlan) return;
    setIsDeploying(true);
    try {
      const response = await fetch("/api/deployments", { method: "POST", headers: authHeader(), body: JSON.stringify({ templateId: template.id, botName: botName.trim(), envVars, planId: selectedPlan.id }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) toast({ title: "Not enough coins", description: `This plan needs ${data.requiredCoins} coins. Your balance is ${data.balance}. Add coins in your wallet.`, variant: "destructive" });
        else toast({ title: "Deployment failed", description: data.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Deployment started!", description: `${selectedPlan.name} · ${selectedPlan.coins} coins` });
      setLocation(`/deployments/${data.id}`);
    } catch { toast({ title: "Could not start deployment", variant: "destructive" }); }
    finally { setIsDeploying(false); }
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

  if (!template) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Template not found.</p>
          <Button variant="link" asChild><Link href="/templates">Back to templates</Link></Button>
        </div>
      </Layout>
    );
  }

  const envFields = Object.entries(
    (template.appJson?.env as Record<string, { description?: string; required?: boolean }>) ?? {}
  );
  const requiredEnvFields = envFields.filter(([, config]) => config.required !== false);
  const optionalEnvFields = envFields.filter(([, config]) => config.required === false);
  const renderEnvField = ([key, config]: typeof envFields[number]) => (
    <div key={key} className="space-y-1.5">
      <Label htmlFor={key} className="flex items-center gap-1.5 text-xs">
        <code className="text-primary">{key}</code>
        {config.required !== false && <Badge variant="outline" className="text-[10px] px-1 py-0">required</Badge>}
      </Label>
      {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
      <Input
        id={key}
        placeholder={config.description ?? key}
        value={envVars[key] ?? ""}
        onChange={(e) => setEnvVars((prev) => ({ ...prev, [key]: e.target.value }))}
        className="font-mono text-sm"
      />
    </div>
  );

  return (
    <Layout>
      <div className="container max-w-3xl px-4 py-8 mx-auto">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href="/templates"><ArrowLeft className="h-4 w-4 mr-1" /> All Templates</Link>
        </Button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 border border-border/40">
            {template.thumbnail ? (
              <img src={template.thumbnail} alt={template.name}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="h-full w-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{template.name}</h1>
              <Badge variant="secondary">{template.category}</Badge>
              {(template.deployCount ?? 0) > 0 && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Users className="h-3 w-3" /> {template.deployCount} deployed
                </Badge>
              )}
              {template.isFree && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 gap-1"><Gift className="h-3 w-3" /> Free template</Badge>}
              <Badge variant="outline" className="gap-1"><Coins className="h-3 w-3" /> Hosting plan required</Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{template.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">/{template.slug}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <Button variant="outline" size="sm" asChild>
            <a href={template.githubRepo} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4 mr-1.5" /> View Source
            </a>
          </Button>
        </div>

        <Separator className="mb-6" />

        {/* Deploy form */}
        <form onSubmit={handleDeploy} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" /> Bot Configuration
              </CardTitle>
              <CardDescription>Give your bot a name and fill in required variables.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bot-name">Bot Name</Label>
                <Input
                  id="bot-name"
                  placeholder="my-awesome-bot"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                />
              </div>

              {envFields.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <KeyRound className="h-4 w-4" /> Environment Variables
                    </p>
                    {requiredEnvFields.length > 0 && <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required variables</p>
                      {requiredEnvFields.map(renderEnvField)}
                    </div>}
                    {optionalEnvFields.length > 0 && <details className="group rounded-lg border border-border/60 px-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        <span>More variables <span className="font-normal text-muted-foreground">({optionalEnvFields.length} optional)</span></span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="space-y-4 border-t border-border/60 pb-3 pt-4">
                        {optionalEnvFields.map(renderEnvField)}
                      </div>
                    </details>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full gap-2"
            size="lg"
            disabled={isDeploying || isLoadingCoins || !plans.length}
          >
            {isDeploying ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deploying...</>
            ) : (
              <><Zap className="h-4 w-4" /> Choose a hosting plan</>
            )}
          </Button>
        </form>
      </div>
      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Choose a hosting plan</DialogTitle><DialogDescription>Plans replace template fees. Coins are charged from your wallet when the bot is deployed.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)} className={`rounded-xl border p-4 text-left transition-colors ${selectedPlan?.id === plan.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}>
              <span className="font-semibold">{plan.name}</span><span className="mt-1 block text-sm text-muted-foreground">{plan.days} days</span><span className="mt-3 flex items-center gap-1.5 text-primary"><Coins className="h-4 w-4" />{plan.coins} coins</span>
            </button>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm"><span>{isLoadingCoins ? "Checking coin balance…" : `Your balance: ${coinBalance.toLocaleString()} coins`}</span><Link href="/wallet" className="text-primary underline-offset-4 hover:underline">Add coins</Link></div>
          <DialogFooter><Button variant="outline" onClick={() => setIsPlanDialogOpen(false)}>Cancel</Button><Button disabled={!selectedPlan || isDeploying || isLoadingCoins} onClick={() => void confirmDeploy()}>{isDeploying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Deploy {selectedPlan ? `· ${selectedPlan.coins} coins` : ""}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
