import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateTemplate, useFetchAppJson, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Github, Loader2, Sparkles, Bot, Code2,
  CheckCircle2, AlertCircle, DollarSign, Gift, Globe,
} from "lucide-react";

const CURRENCIES = ["KES", "USD", "NGN", "GHS", "UGX", "TZS", "ZAR"];

const templateSchema = z.object({
  name: z.string().min(2, "Name is required"),
  slug: z.string().optional().or(z.literal("")),
  description: z.string().min(10, "Description is required"),
  githubRepo: z.string().min(5, "GitHub URL is required"),
  category: z.string().min(2, "Category is required"),
  thumbnail: z.string().optional().or(z.literal("")),
  appJson: z.string().min(2, "Valid JSON is required"),
  isFree: z.boolean().default(false),
  price: z.number().min(0).default(0),
  currency: z.string().default("KES"),
  pairSiteUrl: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof templateSchema>;

interface EnvField { key: string; description: string; required?: boolean; }

export default function AdminTemplateNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [envFields, setEnvFields] = useState<EnvField[]>([]);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [isFreeToggle, setIsFreeToggle] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "", slug: "", description: "", githubRepo: "", category: "",
      thumbnail: "", appJson: "{}", isFree: false, price: 0,
      currency: "KES", pairSiteUrl: "",
    },
  });

  const fetchAppJson = useFetchAppJson({
    mutation: {
      onSuccess: (data: any) => {
        setFetchStatus("ok");
        form.setValue("name", data.name ?? "");
        form.setValue("description", (data.description as string) ?? "");
        form.setValue("appJson", JSON.stringify(data.raw, null, 2));
        if (data.logo) form.setValue("thumbnail", data.logo);
        const env = (data.env as Record<string, { description?: string; required?: boolean }>) ?? {};
        setEnvFields(Object.entries(env).map(([key, val]) => ({
          key, description: val.description ?? "", required: val.required !== false,
        })));
      },
      onError: () => setFetchStatus("error"),
    },
  });

  const createTemplate = useCreateTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template created!" });
        queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        setLocation("/admin");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create template", description: err.data?.error ?? "Unknown error", variant: "destructive" });
      },
    },
  });

  function handleRepoChange(url: string) {
    form.setValue("githubRepo", url);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (url.includes("github.com")) {
      setFetchStatus("loading");
      debounceRef.current = setTimeout(() => {
        fetchAppJson.mutate({ data: { repoUrl: url } });
      }, 800);
    }
  }

  function handleFreeToggle(val: boolean) {
    setIsFreeToggle(val);
    form.setValue("isFree", val);
    if (val) form.setValue("price", 0);
  }

  function onSubmit(values: FormValues) {
    let parsed: unknown;
    try { parsed = JSON.parse(values.appJson); }
    catch { toast({ title: "Invalid JSON in App JSON field", variant: "destructive" }); return; }

    createTemplate.mutate({
      data: {
        name: values.name,
        slug: values.slug || undefined,
        description: values.description,
        githubRepo: values.githubRepo,
        category: values.category,
        thumbnail: values.thumbnail || undefined,
        appJson: parsed as Record<string, unknown>,
        isFree: values.isFree,
        price: values.isFree ? 0 : Math.round((values.price ?? 0) * 100),
        currency: values.currency,
        pairSiteUrl: values.pairSiteUrl || undefined,
      },
    });
  }

  return (
    <ProtectedRoute adminOnly>
      <Layout>
        <div className="container max-w-3xl px-4 py-8 mx-auto">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" asChild>
            <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Back to Admin</Link>
          </Button>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Add New Template</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Paste a GitHub URL to auto-fill from app.json
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* GitHub Repo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Github className="h-4 w-4" /> GitHub Repository
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FormField control={form.control} name="githubRepo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repository URL</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="https://github.com/owner/repo"
                            className="pl-9 font-mono text-sm"
                            value={field.value}
                            onChange={(e) => handleRepoChange(e.target.value)}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {fetchStatus === "loading" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching app.json...
                    </div>
                  )}
                  {fetchStatus === "ok" && (
                    <div className="flex items-center gap-2 text-xs text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" /> app.json loaded
                    </div>
                  )}
                  {fetchStatus === "error" && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" /> Could not fetch app.json. Fill fields manually.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Basic Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" /> Template Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="My Discord Bot" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="slug" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Slug <span className="text-muted-foreground text-xs">(optional — auto-generated from name)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">/templates/</span>
                          <Input placeholder="wolf-bot" className="pl-[7.5rem] font-mono text-sm" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription className="text-xs">
                        Used in the URL, e.g. /templates/wolf-bot. Leave blank to auto-generate.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea placeholder="What does this bot do?" rows={3} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl><Input placeholder="e.g. Moderation" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="thumbnail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thumbnail URL <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Pair Site URL */}
                  <FormField control={form.control} name="pairSiteUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" /> Pair Site URL <span className="text-muted-foreground text-xs">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="https://yourwebsite.com" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription className="text-xs">
                        Link to a related website or demo. Shows as a globe button on template cards.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              {/* Pricing */}
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Pricing
                  </CardTitle>
                  <CardDescription>Set whether this template is free or paid</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <Gift className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Free Template</p>
                        <p className="text-xs text-muted-foreground">Users can deploy without paying</p>
                      </div>
                    </div>
                    <Switch checked={isFreeToggle} onCheckedChange={handleFreeToggle} />
                  </div>

                  {!isFreeToggle && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="number" min={0} step={0.01} placeholder="0.00" className="pl-9"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs">Full price e.g. 500 = KES 500</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="currency" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}

                  {!isFreeToggle && form.watch("price") > 0 && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Users will pay <strong className="mx-1">{form.watch("currency")} {form.watch("price")}</strong> to deploy
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Env Variables Preview */}
              {envFields.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Code2 className="h-4 w-4" /> Environment Variables
                      <Badge variant="secondary" className="ml-auto text-xs">{envFields.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {envFields.map((f) => (
                        <div key={f.key} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/40">
                          <code className="text-xs font-mono text-primary mt-0.5 flex-shrink-0">{f.key}</code>
                          <span className="text-xs text-muted-foreground flex-1">{f.description}</span>
                          {f.required && <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">required</Badge>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* App JSON */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4" /> App JSON
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField control={form.control} name="appJson" render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea className="font-mono text-xs min-h-[180px] resize-y" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Button type="submit" className="w-full gap-2" disabled={createTemplate.isPending}>
                {createTemplate.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  : <><Sparkles className="h-4 w-4" /> Create Template</>
                }
              </Button>
            </form>
          </Form>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
