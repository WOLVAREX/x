import { useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Check, Code2, Copy, ExternalLink, Rocket, ShieldCheck, Terminal } from "lucide-react";
import { Link } from "wouter";

const nodeExample = `const platform = process.env.JHP_PLATFORM ?? "local";\nconst platformUrl = process.env.JHP_PLATFORM_URL;\n\nconsole.log(\`Hosted on \${platform}\`);`;
const pythonExample = `import os\n\nplatform = os.getenv("JHP_PLATFORM", "local")\nplatform_url = os.getenv("JHP_PLATFORM_URL")\nprint(f"Hosted on {platform}")`;

function CodeSample({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Could not copy code", description: "Select the snippet and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-[#080d14]">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-200"><code>{code}</code></pre>
    </div>
  );
}

export default function IntegrationPage() {
  return (
    <Layout>
      <div className="container mx-auto max-w-5xl space-y-8 px-4 py-10 sm:py-14">
        <header className="max-w-3xl">
          <Badge variant="outline" className="mb-4 gap-2"><Code2 className="h-3.5 w-3.5 text-primary" /> Developer integration</Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bring your bot to J.H.P</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Deploy a bot template through J.H.P and let its own status page, commands, or support messages identify J.H.P as the hosting platform.
          </p>
        </header>

        <Card className="border-primary/20 bg-primary/[0.04]">
          <CardContent className="flex items-start gap-4 p-5 sm:p-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Rocket className="h-5 w-5 text-primary" /></div>
            <div>
              <h2 className="font-semibold">Platform variables are added on deployment</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Every new J.H.P deployment receives these values automatically. Your bot can read them to display J.H.P branding; no API key or extra setup is needed.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <code className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-xs">JHP_PLATFORM=J.H.P</code>
                <code className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-xs">JHP_PLATFORM_URL=https://host.junex.space</code>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-5 md:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Node.js</CardTitle><CardDescription>Read the platform identity from the environment.</CardDescription></CardHeader>
            <CardContent><CodeSample label="JavaScript" code={nodeExample} /></CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Python</CardTitle><CardDescription>The same variables work with Python bots.</CardDescription></CardHeader>
            <CardContent><CodeSample label="Python" code={pythonExample} /></CardContent>
          </Card>
        </section>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Add your bot as a J.H.P template</CardTitle>
            <CardDescription>Make your repository deployable by configuring its template details and required environment variables.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Include a valid Heroku-style app.json in the repository so J.H.P can install dependencies and collect the bot’s required configuration. Contact a J.H.P administrator to publish the repository in the template library.</p>
            <Button variant="outline" className="shrink-0 gap-2" asChild><Link href="/docs"><Terminal className="h-4 w-4" /> Read setup docs <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
          </CardContent>
        </Card>

        <p className="text-xs leading-5 text-muted-foreground">J.H.P manages deployment and supplies the platform identity. Your bot must read <code className="rounded bg-muted px-1 py-0.5">JHP_PLATFORM</code> and use it in its own interface if you want users to see the J.H.P name.</p>
      </div>
    </Layout>
  );
}
