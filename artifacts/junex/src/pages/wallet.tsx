import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Loader2, CreditCard, Smartphone, CheckCircle2, Clock, XCircle,
  Receipt, ArrowRight, ShoppingBag, Plus, Wallet, ChevronLeft,
  ArrowUpRight, ArrowDownLeft, Shield,
} from "lucide-react";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";

interface WalletData {
  balance: number;
  currency: string;
  transactions: Transaction[];
}

interface Transaction {
  id: number;
  type: "deposit" | "deduction";
  amount: number;
  currency: string;
  description: string;
  status: string;
  method: string | null;
  balanceAfter: number;
  reference: string | null;
  createdAt: string;
}

type DepositStep = "amount" | "method" | "mpesa-phone" | "mpesa-pending" | "card-pending" | "done";

const PRESET_AMOUNTS = [500, 1000, 2000, 5000];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
    failed: "bg-red-500/15 text-red-500 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg[status] ?? cfg.pending}`}>
      {status === "success" && <CheckCircle2 className="h-3 w-3" />}
      {status === "pending" && <Clock className="h-3 w-3" />}
      {status === "failed" && <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

function fmt(amount: number, currency = "KES") {
  return `${currency} ${(amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}
function fmtCoins(amount: number) { return `${amount.toLocaleString()} coins`; }

function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function WalletPage() {
  const { toast } = useToast();
  const [data, setData] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);

  // Deposit modal state
  const [step, setStep] = useState<DepositStep>("amount");
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<"card" | "mpesa">("card");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/wallet`, { headers: authHeader() });
      const json = await res.json();
      setData(json);
    } catch {
      toast({ title: "Could not load wallet", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  function getAmount(): number {
    if (selectedAmount) return selectedAmount * 100;
    const parsed = parseFloat(customAmount);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }

  function resetDeposit() {
    setStep("amount"); setCustomAmount(""); setSelectedAmount(null);
    setMethod("card"); setPhone(""); setReference(""); setIsProcessing(false); setIsVerifying(false);
  }

  async function handleCardDeposit() {
    const amount = getAmount();
    if (amount < 300) { toast({ title: "Minimum top-up is KES 3", variant: "destructive" }); return; }
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/wallet/deposit/card`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ amount, currency: "KES" }),
      });
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? "Failed", variant: "destructive" }); return; }

      // Open Paystack inline popup
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const handler = new PaystackPop();
      handler.newTransaction({
        key: "",
        accessCode: d.accessCode,
        channels: ["card"],
        onSuccess: async (tx: { reference: string }) => {
          setReference(tx.reference);
          setStep("card-pending");
          // Auto verify
          const vRes = await fetch(`${API_BASE}/api/wallet/verify/${tx.reference}`, { headers: authHeader() });
          const vData = await vRes.json();
          if (vData.status === "success") {
            toast({ title: `Wallet topped up! New balance: ${fmtCoins(vData.newBalance)}` });
            setStep("done");
            fetchWallet();
          } else {
            toast({ title: "Could not confirm payment. Try verifying manually.", variant: "destructive" });
          }
          setIsProcessing(false);
        },
        onCancel: () => { toast({ title: "Payment cancelled" }); setIsProcessing(false); },
      });
    } catch {
      toast({ title: "Could not initiate payment", variant: "destructive" });
      setIsProcessing(false);
    }
  }

  async function handleStkPush() {
    if (!phone.trim()) { toast({ title: "Enter your M-Pesa number", variant: "destructive" }); return; }
    const amount = getAmount();
    if (amount < 300) { toast({ title: "Minimum top-up is KES 3", variant: "destructive" }); return; }
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/wallet/deposit/mpesa`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ phone: phone.trim(), amount }),
      });
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? "STK push failed", variant: "destructive" }); return; }
      setReference(d.reference);
      setStep("mpesa-pending");
      toast({ title: "STK push sent! Check your phone." });
    } catch {
      toast({ title: "STK push failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  function startPolling(ref: string) {
    let attempts = 0;
    const maxAttempts = 24; // 2 min max
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${API_BASE}/api/wallet/verify/${ref}`, { headers: authHeader() });
        const d = await res.json();
        if (d.status === "success") {
          clearInterval(interval);
          toast({ title: `Payment confirmed! Balance updated.` });
          setStep("done");
          fetchWallet();
        } else if (d.status === "failed") {
          clearInterval(interval);
          toast({ title: "Payment failed. Please try again.", variant: "destructive" });
          resetDeposit();
        }
      } catch {}
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 5000);
  }

  async function handleVerify() {
    if (!reference) return;
    setIsVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/api/wallet/verify/${reference}`, { headers: authHeader() });
      const d = await res.json();
      if (d.status === "success") {
        toast({ title: `Wallet topped up! New balance: ${fmtCoins(d.newBalance)}` });
        setStep("done");
        fetchWallet();
      } else {
        toast({ title: "Payment not confirmed yet. Try again after entering PIN.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Verification failed", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  }

  function handleProceed() {
    if (method === "card") handleCardDeposit();
    else setStep("mpesa-phone");
  }

  return (
    <Layout>
      <div className="container max-w-4xl px-4 py-8 mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Wallet</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage your balance and transactions</p>
          </div>
          <Button className="gap-2" onClick={() => { resetDeposit(); setShowDeposit(true); }}>
            <Plus className="h-4 w-4" /> Add Funds
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Balance card */}
            <Card className="border-primary/30 bg-primary/5 mb-6">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                  <p className="text-4xl font-bold text-primary">
                    {fmtCoins(data?.balance ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    KES top-ups add 5 coins per KES 1. Hosting plans are paid in coins.
                  </p>
                </div>
                <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Wallet className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <Card className="border-border/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Total Deposited</CardTitle>
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xl font-bold">
                    {fmt(
                      (data?.transactions ?? [])
                        .filter(t => t.type === "deposit" && t.status === "success")
                        .reduce((s, t) => s + t.amount, 0),
                      data?.currency
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Total Spent</CardTitle>
                  <ArrowDownLeft className="h-4 w-4 text-red-400" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xl font-bold">
                    {fmt(
                      (data?.transactions ?? [])
                        .filter(t => t.type === "deduction")
                        .reduce((s, t) => s + t.amount, 0),
                      data?.currency
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/40 col-span-2 md:col-span-1">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Transactions</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xl font-bold">{data?.transactions?.length ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Transaction history */}
            <Card className="border-border/40">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Transaction History
                </CardTitle>
                <CardDescription>All deposits and bot deployments</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!data?.transactions?.length ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <ShoppingBag className="h-12 w-12 text-muted-foreground/20 mb-4" />
                    <p className="font-medium text-muted-foreground">No transactions yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-5">Add funds to get started.</p>
                    <Button size="sm" onClick={() => { resetDeposit(); setShowDeposit(true); }}>
                      <Plus className="h-4 w-4 mr-1.5" /> Add Funds
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {data.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-4 px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          tx.type === "deposit" ? "bg-emerald-500/10" : "bg-red-500/10"
                        }`}>
                          {tx.type === "deposit"
                            ? <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                            : <ArrowDownLeft className="h-5 w-5 text-red-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{tx.description}</p>
                            <StatusBadge status={tx.status} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {tx.method && (
                              <span className="text-xs text-muted-foreground capitalize">
                                {tx.method === "mpesa" ? "M-Pesa" : "Card"}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(tx.createdAt), "MMM d, yyyy h:mm a")}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-semibold text-sm ${tx.type === "deposit" ? "text-emerald-500" : "text-red-400"}`}>
                            {tx.type === "deposit" ? "+" : "-"}{fmt(tx.amount, tx.currency)}
                          </p>
                          {tx.status === "success" && (
                            <p className="text-xs text-muted-foreground">bal: {fmt(tx.balanceAfter, tx.currency)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Deposit Modal ── */}
      <Dialog open={showDeposit} onOpenChange={(v) => { setShowDeposit(v); if (!v) resetDeposit(); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              {step === "amount" && "Add Funds"}
              {step === "method" && "Choose Payment Method"}
              {step === "mpesa-phone" && "M-Pesa Payment"}
              {step === "mpesa-pending" && "Confirm Payment"}
              {step === "card-pending" && "Processing..."}
              {step === "done" && "Funds Added!"}
            </DialogTitle>
            <DialogDescription>
              {step === "amount" && "Select or enter an amount to add to your wallet"}
              {step === "method" && `Adding ${fmt(getAmount())} to your wallet`}
              {step === "mpesa-phone" && `You will be charged ${fmt(getAmount())}`}
              {step === "mpesa-pending" && "Enter your M-Pesa PIN, then verify below"}
              {step === "card-pending" && "Verifying your payment..."}
              {step === "done" && "Your wallet balance has been updated"}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step: Amount ── */}
          {step === "amount" && (
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-2 gap-3">
                {PRESET_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => { setSelectedAmount(a); setCustomAmount(""); }}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      selectedAmount === a
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 hover:border-primary/40"
                    }`}
                  >
                    KES {a.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Custom amount (KES)</Label>
                <Input
                  type="number"
                  placeholder="Enter amount..."
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                  min={1}
                  className="text-base"
                />
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  const amt = getAmount();
                  if (amt < 100) { toast({ title: "Minimum deposit is KES 1", variant: "destructive" }); return; }
                  setStep("method");
                }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ── Step: Method ── */}
          {step === "method" && (
            <div className="space-y-4 mt-1">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
                <span className="text-sm text-muted-foreground">Amount to deposit</span>
                <span className="font-bold text-primary text-lg">{fmt(getAmount())}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMethod("card")}
                  className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    method === "card" ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"
                  }`}
                >
                  <div className={`p-3 rounded-xl ${method === "card" ? "bg-primary/20" : "bg-muted"}`}>
                    <CreditCard className={`h-6 w-6 ${method === "card" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <p className="text-sm font-medium">Card</p>
                  <p className="text-xs text-muted-foreground text-center">Visa, Mastercard</p>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("mpesa")}
                  className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    method === "mpesa" ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"
                  }`}
                >
                  <div className={`p-3 rounded-xl ${method === "mpesa" ? "bg-primary/20" : "bg-muted"}`}>
                    <Smartphone className={`h-6 w-6 ${method === "mpesa" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <p className="text-sm font-medium">M-Pesa</p>
                  <p className="text-xs text-muted-foreground text-center">STK Push</p>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                Secured by Paystack
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("amount")}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 gap-2" onClick={handleProceed} disabled={isProcessing}>
                  {isProcessing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening...</>
                    : <><ArrowRight className="h-4 w-4" /> Pay Now</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: M-Pesa phone ── */}
          {step === "mpesa-phone" && (
            <div className="space-y-4 mt-1">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-bold text-primary">{fmt(getAmount())}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mpesa-phone">M-Pesa Phone Number</Label>
                <Input
                  id="mpesa-phone"
                  placeholder="254712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="font-mono text-base"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Format: 254XXXXXXXXX (Safaricom Kenya)</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("method")}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 gap-2" onClick={handleStkPush} disabled={isProcessing}>
                  {isProcessing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                    : <><Smartphone className="h-4 w-4" /> Send STK Push</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: M-Pesa pending ── */}
          {step === "mpesa-pending" && (
            <div className="space-y-4 mt-1 text-center">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <p className="font-semibold">Check your phone</p>
                <p className="text-sm text-muted-foreground">
                  STK push sent to <strong>{phone}</strong>. Enter your M-Pesa PIN.
                </p>
                <code className="text-xs bg-muted/50 border border-border/40 px-3 py-1.5 rounded-lg text-muted-foreground">
                  {reference}
                </code>
              </div>
              <Button className="w-full gap-2" onClick={handleVerify} disabled={isVerifying}>
                {isVerifying
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                  : <><CheckCircle2 className="h-4 w-4" /> I have paid - Verify</>
                }
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={resetDeposit}>Start over</Button>
            </div>
          )}

          {/* ── Step: Card pending ── */}
          {step === "card-pending" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">Confirming your payment...</p>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <p className="font-semibold text-lg">Funds Added!</p>
              <p className="text-sm text-muted-foreground">Your wallet balance has been updated.</p>
              <div className="flex gap-3 w-full mt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowDeposit(false); resetDeposit(); }}>
                  Close
                </Button>
                <Button className="flex-1 gap-2" asChild>
                  <Link href="/templates">Deploy a Bot <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

