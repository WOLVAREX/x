import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Coins, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Plan = { id: string; name: string; days: number; coins: number };
const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("junex_token")}` });
const defaults: Plan[] = [{ id: "week", name: "1 Week", days: 7, coins: 15 }, { id: "two-weeks", name: "2 Weeks", days: 14, coins: 25 }, { id: "month", name: "1 Month", days: 30, coins: 35 }];

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>(defaults);
  const [kesPerCoin, setKesPerCoin] = useState("2");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/plans`, { headers: headers() })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setPlans(data.plans); setKesPerCoin(String(data.kesPerCoin ?? 2)); })
      .catch((error) => toast({ title: "Could not load plans", description: error.message, variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [toast]);

  function update(index: number, changes: Partial<Plan>) { setPlans((current) => current.map((plan, i) => i === index ? { ...plan, ...changes } : plan)); }
  async function save() {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/plans`, { method: "PUT", headers: headers(), body: JSON.stringify({ plans, kesPerCoin: Number(kesPerCoin) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save plans");
      setPlans(data.plans); setKesPerCoin(String(data.kesPerCoin)); toast({ title: "Hosting plans and coin value saved" });
    } catch (error) { toast({ title: "Could not save plans", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setIsSaving(false); }
  }

  return <Layout><div className="container mx-auto max-w-4xl px-4 py-8 sm:py-10">
    <Link href="/admin" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Admin dashboard</Link>
    <div className="mb-6"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hosting plans</h1><p className="mt-2 text-sm text-muted-foreground">Set the wallet conversion rate and edit the coin cost of each plan.</p></div>
    <Card className="border-border/60"><CardHeader><CardTitle>Available plans</CardTitle><CardDescription>Plan prices take the place of per-template fees at deployment.</CardDescription></CardHeader><CardContent className="space-y-4">
      <label className="block max-w-sm space-y-1.5 text-sm font-medium">Coin value (KES per coin)<Input type="number" min="0.01" max="100000" step="0.01" value={kesPerCoin} onChange={(event) => setKesPerCoin(event.target.value)} disabled={isLoading} /><span className="block text-xs font-normal text-muted-foreground">Deposits are converted at this rate. Minimum deposit is at least one coin and KES 3.</span></label>
      {isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : plans.map((plan, index) => <div key={`${plan.id}-${index}`} className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-[minmax(0,1fr)_120px_120px_40px] sm:items-end">
        <label className="space-y-1.5 text-sm font-medium">Plan name<Input maxLength={60} value={plan.name} onChange={(event) => update(index, { name: event.target.value, id: event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `plan-${index + 1}` })} /></label>
        <label className="space-y-1.5 text-sm font-medium">Days<Input type="number" min={1} max={365} value={plan.days} onChange={(event) => update(index, { days: Number(event.target.value) })} /></label>
        <label className="space-y-1.5 text-sm font-medium">Coins<Input type="number" min={1} max={500000} value={plan.coins} onChange={(event) => update(index, { coins: Number(event.target.value) })} /></label>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${plan.name}`} disabled={plans.length <= 1} onClick={() => setPlans((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-4"><Coins className="h-3.5 w-3.5" /> KES {(plan.coins * (Number(kesPerCoin) || 0)).toLocaleString()} equivalent · {plan.days} days</p>
      </div>)}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="outline" className="gap-2" disabled={plans.length >= 12 || isLoading} onClick={() => setPlans((current) => [...current, { id: `plan-${current.length + 1}`, name: "New plan", days: 7, coins: 15 }])}><Plus className="h-4 w-4" /> Add plan</Button><Button type="button" className="gap-2" disabled={isSaving || isLoading} onClick={() => void save()}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save plans</Button></div>
    </CardContent></Card>
  </div></Layout>;
}
