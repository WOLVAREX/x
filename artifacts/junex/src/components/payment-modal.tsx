import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Smartphone, Loader2, CheckCircle2,
  Shield, ArrowRight, Gift, ChevronLeft,
} from "lucide-react";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";

type PaymentMethod = "card" | "mpesa";
type Step = "method" | "mpesa-phone" | "mpesa-pending" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentSuccess: () => void;
  templateId: number;
  templateName: string;
  price: number;
  currency: string;
  isFree: boolean;
}

function formatPrice(price: number, currency: string) {
  return `${currency} ${(price / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function PaymentModal({
  open, onOpenChange, onPaymentSuccess,
  templateId, templateName, price, currency, isFree,
}: Props) {
  const { toast } = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [step, setStep] = useState<Step>("method");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  function authHeader() {
    const token = localStorage.getItem("junex_token");
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  function reset() {
    setStep("method"); setPhone(""); setReference(""); setIsLoading(false); setIsVerifying(false);
  }

  // ── Card payment via Paystack inline popup ─────────────────
  async function handleCardPay() {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/initiate`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ templateId, currency }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Payment failed", variant: "destructive" });
        return;
      }

      // Load Paystack inline and open popup
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const handler = new PaystackPop();
      handler.newTransaction({
        key: "", // Paystack uses the accessCode instead
        accessCode: data.accessCode,
        onSuccess: async (transaction: { reference: string }) => {
          // Verify on our backend
          const vRes = await fetch(`${API_BASE}/api/payments/verify/${transaction.reference}`, {
            headers: authHeader(),
          });
          const vData = await vRes.json();
          if (vData.unlocked) {
            toast({ title: "Payment successful! Deploying your bot..." });
            setStep("done");
            setTimeout(() => { onPaymentSuccess(); onOpenChange(false); reset(); }, 1000);
          } else {
            toast({ title: "Payment verification failed. Contact support.", variant: "destructive" });
          }
        },
        onCancel: () => {
          toast({ title: "Payment cancelled" });
          setIsLoading(false);
        },
      });
    } catch (err) {
      toast({ title: "Could not initiate payment", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  // ── M-Pesa STK push ────────────────────────────────────────
  async function handleStkPush() {
    if (!phone.trim()) {
      toast({ title: "Enter your M-Pesa phone number", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/stk-push`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ templateId, phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "STK push failed", variant: "destructive" });
        return;
      }
      setReference(data.reference);
      setStep("mpesa-pending");
      toast({ title: "STK push sent! Check your phone." });
    } catch {
      toast({ title: "STK push failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  // ── Verify M-Pesa payment ──────────────────────────────────
  async function handleVerify() {
    if (!reference) return;
    setIsVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/verify/${reference}`, {
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast({ title: "Payment confirmed! Deploying your bot..." });
        setStep("done");
        setTimeout(() => { onPaymentSuccess(); onOpenChange(false); reset(); }, 1000);
      } else {
        toast({ title: "Payment not confirmed yet", description: "Enter PIN on your phone and try again." });
      }
    } catch {
      toast({ title: "Verification failed", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  }

  // ── Proceed button on method selection ────────────────────
  function handleProceed() {
    if (method === "card") {
      handleCardPay();
    } else {
      setStep("mpesa-phone");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            {step === "method" && "Choose Payment Method"}
            {step === "mpesa-phone" && "M-Pesa Payment"}
            {step === "mpesa-pending" && "Confirm M-Pesa Payment"}
            {step === "done" && "Payment Complete"}
          </DialogTitle>
          <DialogDescription>
            {step === "method" && `Unlock "${templateName}" — ${formatPrice(price, currency)}`}
            {step === "mpesa-phone" && `You will be charged ${formatPrice(price, currency)}`}
            {step === "mpesa-pending" && "Enter your M-Pesa PIN on your phone, then click verify"}
            {step === "done" && "Your bot is being deployed!"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Free shortcut ── */}
        {isFree && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Gift className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="font-semibold">This template is free!</p>
            <Button className="w-full" onClick={() => { onPaymentSuccess(); onOpenChange(false); }}>
              Deploy Now
            </Button>
          </div>
        )}

        {/* ── Method selection ── */}
        {!isFree && step === "method" && (
          <div className="space-y-4 mt-1">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="font-bold text-lg text-primary">{formatPrice(price, currency)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Card */}
              <button
                type="button"
                onClick={() => setMethod("card")}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  method === "card" ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"
                }`}
              >
                <div className={`p-3 rounded-xl ${method === "card" ? "bg-primary/20" : "bg-muted"}`}>
                  <CreditCard className={`h-6 w-6 ${method === "card" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <p className="text-sm font-medium">Card</p>
                <p className="text-xs text-muted-foreground text-center">Visa, Mastercard</p>
              </button>

              {/* M-Pesa */}
              <button
                type="button"
                onClick={() => setMethod("mpesa")}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
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

            <Button className="w-full gap-2" onClick={handleProceed} disabled={isLoading}>
              {isLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening...</>
                : <><ArrowRight className="h-4 w-4" /> Continue with {method === "card" ? "Card" : "M-Pesa"}</>
              }
            </Button>
          </div>
        )}

        {/* ── M-Pesa phone input ── */}
        {!isFree && step === "mpesa-phone" && (
          <div className="space-y-4 mt-1">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-bold text-primary">{formatPrice(price, currency)}</span>
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
              <p className="text-xs text-muted-foreground">
                Format: <code>254XXXXXXXXX</code> — Safaricom Kenya only
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("method")}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <Button className="flex-1 gap-2" onClick={handleStkPush} disabled={isLoading}>
                {isLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  : <><Smartphone className="h-4 w-4" /> Send STK Push</>
                }
              </Button>
            </div>
          </div>
        )}

        {/* ── M-Pesa pending verify ── */}
        {!isFree && step === "mpesa-pending" && (
          <div className="space-y-4 mt-1 text-center">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <p className="font-semibold">Check your phone</p>
              <p className="text-sm text-muted-foreground">
                A payment request was sent to <strong>{phone}</strong>.
                Enter your M-Pesa PIN to complete.
              </p>
              <code className="text-xs bg-muted/50 border border-border/40 px-3 py-1.5 rounded-lg text-muted-foreground">
                {reference}
              </code>
            </div>

            <Button className="w-full gap-2" onClick={handleVerify} disabled={isVerifying}>
              {isVerifying
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                : <><CheckCircle2 className="h-4 w-4" /> I have paid — Verify</>
              }
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={reset}>
              Start over
            </Button>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="font-semibold text-lg">Payment Confirmed!</p>
            <p className="text-sm text-muted-foreground">Proceeding to deploy your bot...</p>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
