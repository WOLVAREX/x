import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useCreateDeployment } from "@workspace/api-client-react";
import type { Template } from "@workspace/api-client-react";
import {
  Loader2, Github, ArrowLeft, Bot, Users, Zap, Lock,
  KeyRound, CreditCard, CheckCircle2, Gift, Wallet, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(amount: number, currency = "KES") {
  return `${currency} ${(amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  // Inject OG / Twitter meta tags while the page is mounted
  useEffect(() => {
    if (!template) return;
    const url = window.location.href;
    document.title = `${template.name} — JXHP`;
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
      document.title = "JXHP";
      ["og:title","og:description","og:url","og:type","og:image",
       "twitter:card","twitter:title","twitter:description","twitter:image","description"]
        .forEach(removeMeta);
    };
  }, [template]);

  useEffect(() => {
    if (!template || template.isFree) return;
    setCheckingBalance(true);
    fetch("/api/wallet", { headers: authHeader() })
      .then(r => r.json())
      .then(d => setWalletBalance(d.balance ?? 0))
      .catch(() => setWalletBalance(0))
      .finally(() => setCheckingBalance(false));
  }, [template]);

  const createMutation = useCreateDeployment({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Deployment started!" });
        setLocation(`/deployments/${data.id}`);
      },
      onError: (error: any) => {
        toast({ title: "Deployment failed", description: error.data?.error ?? "Unknown error", variant: "destructive" });
      },
    },
  });

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

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm() || !template) return;

    if (!template.isFree) {
      const deductRes = await fetch("/api/wallet/deduct", {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ templateId: template.id, description: `Deployed: ${template.name}` }),
      });
      const deductData = await deductRes.json();
      if (!deductRes.ok) {
        if (deductRes.status === 402) {
          toast({
            title: "Insufficient balance",
            description: `You need ${fmt(deductData.required)} but have ${fmt(deductData.balance)}. Top up your wallet.`,
            variant: "destructive",
          });
          return;
        }
        toast({ title: deductData.error ?? "Payment failed", variant: "destructive" });
        return;
      }
      setWalletBalance(deductData.newBalance);
    }

    createMutation.mutate({ data: { templateId: template.id, botName: botName.trim(), envVars } });
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

  const price = template.price ?? 0;
  const currency = template.currency ?? "KES";
  const hasEnoughBalance = template.isFree || (walletBalance !== null && walletBalance >= price);
  const shortfall = walletBalance !== null ? Math.max(0, price - walletBalance) : 0;

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
              {template.isFree ? (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 gap-1">
                  <Gift className="h-3 w-3" /> Free
                </Badge>
              ) : (
                <Badge className="bg-primary/15 text-primary border-primary/20 gap-1">
                  <CreditCard className="h-3 w-3" /> {fmt(price, currency)}
                </Badge>
              )}
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

        {/* Balance check */}
        {!template.isFree && (
          <Card className={`mb-6 border ${hasEnoughBalance ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {checkingBalance ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : hasEnoughBalance ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {checkingBalance ? "Checking balance..." : hasEnoughBalance
                      ? "Sufficient balance"
                      : "Insufficient balance"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Wallet: {walletBalance !== null ? fmt(walletBalance, currency) : "..."} &nbsp;|&nbsp;
                    Required: {fmt(price, currency)}
                    {!hasEnoughBalance && shortfall > 0 && ` (need ${fmt(shortfall, currency)} more)`}
                  </p>
                </div>
              </div>
              {!hasEnoughBalance && (
                <Button size="sm" className="gap-2 flex-shrink-0" asChild>
                  <Link href="/wallet"><Wallet className="h-4 w-4" /> Top Up</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

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
                    {envFields.map(([key, config]) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={key} className="flex items-center gap-1.5 text-xs">
                          <code className="text-primary">{key}</code>
                          {config.required !== false && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">required</Badge>
                          )}
                        </Label>
                        {config.description && (
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        )}
                        <Input
                          id={key}
                          placeholder={config.description ?? key}
                          value={envVars[key] ?? ""}
                          onChange={(e) => setEnvVars((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="font-mono text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full gap-2"
            size="lg"
            disabled={createMutation.isPending || (!template.isFree && !hasEnoughBalance)}
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deploying...</>
            ) : !template.isFree && !hasEnoughBalance ? (
              <><Lock className="h-4 w-4" /> Insufficient Balance</>
            ) : (
              <><Zap className="h-4 w-4" /> Deploy Bot {!template.isFree && `- ${fmt(price, currency)}`}</>
            )}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
