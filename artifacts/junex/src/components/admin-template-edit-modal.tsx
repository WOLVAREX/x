import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Gift, Globe } from "lucide-react";

const API_BASE = "http://localhost:8080";
const CURRENCIES = ["KES", "USD", "NGN", "GHS", "UGX", "TZS", "ZAR"];

interface Template {
  id: number;
  name: string;
  description: string;
  githubRepo: string;
  thumbnail: string | null;
  category: string;
  appJson: any;
  isFree: boolean;
  price: number;
  currency: string;
  pairSiteUrl: string | null;
}

interface Props {
  template: Template | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export function AdminTemplateEditModal({ template, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", githubRepo: "", thumbnail: "",
    category: "", appJson: "{}", isFree: false,
    price: "0", currency: "KES", pairSiteUrl: "",
  });

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        description: template.description,
        githubRepo: template.githubRepo,
        thumbnail: template.thumbnail ?? "",
        category: template.category,
        appJson: JSON.stringify(template.appJson, null, 2),
        isFree: template.isFree,
        price: String((template.price ?? 0) / 100),
        currency: template.currency ?? "KES",
        pairSiteUrl: template.pairSiteUrl ?? "",
      });
    }
  }, [template]);

  async function handleSave() {
    if (!template) return;
    setIsSaving(true);
    try {
      let parsedAppJson;
      try { parsedAppJson = JSON.parse(form.appJson); }
      catch { toast({ title: "Invalid JSON in App JSON field", variant: "destructive" }); setIsSaving(false); return; }

      const res = await fetch(`${API_BASE}/api/admin/templates/${template.id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          githubRepo: form.githubRepo,
          thumbnail: form.thumbnail || null,
          category: form.category,
          appJson: parsedAppJson,
          isFree: form.isFree,
          price: form.isFree ? 0 : Math.round(parseFloat(form.price) * 100),
          currency: form.currency,
          pairSiteUrl: form.pairSiteUrl || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: err.error ?? "Failed to save", variant: "destructive" });
        return;
      }
      toast({ title: "Template updated!" });
      onSaved();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Template: {template?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
          </div>

          <div className="space-y-1.5">
            <Label>GitHub Repository</Label>
            <Input value={form.githubRepo} onChange={e => setForm({...form, githubRepo: e.target.value})} className="font-mono text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Thumbnail URL</Label>
              <Input placeholder="https://..." value={form.thumbnail} onChange={e => setForm({...form, thumbnail: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Pair Site URL</Label>
              <Input placeholder="https://..." value={form.pairSiteUrl} onChange={e => setForm({...form, pairSiteUrl: e.target.value})} />
            </div>
          </div>

          {/* Pricing */}
          <div className="p-4 rounded-xl border border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                <Label>Free Template</Label>
              </div>
              <Switch checked={form.isFree} onCheckedChange={v => setForm({...form, isFree: v, price: v ? "0" : form.price})} />
            </div>
            {!form.isFree && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="number" min={0} step={0.01} className="pl-9"
                      value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* App JSON */}
          <div className="space-y-1.5">
            <Label>App JSON</Label>
            <Textarea rows={6} className="font-mono text-xs"
              value={form.appJson} onChange={e => setForm({...form, appJson: e.target.value})} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
