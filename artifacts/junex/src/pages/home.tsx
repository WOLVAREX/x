import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Zap, Shield, Terminal, ArrowRight } from "lucide-react";

const features = [
  "No DevOps knowledge required",
  "One-click template deployments",
  "Full environment variable control",
  "Start, stop & restart anytime",
];

const cards = [
  {
    icon: Zap,
    title: "Instant Deployments",
    desc: "Go from template to live in seconds. Our automated pipeline handles Heroku provisioning end-to-end.",
  },
  {
    icon: Shield,
    title: "Engineered for Reliability",
    desc: "Everything you need to keep your bots online and your community happy.",
  },
  {
    icon: Terminal,
    title: "Full Control",
    desc: "Live logs, env var editing, start/stop/restart — all from one clean dashboard.",
  },
];

export default function Home() {
  const { user } = useAuth();
  const templatesHref = user ? "/templates" : "/register";
  const ctaHref = user ? "/dashboard" : "/register";
  const ctaLabel = user ? "Go to Dashboard" : "Create Free Account";

  return (
    <Layout>
      {/* ── Hero ── */}
      <section className="container mx-auto px-4 py-16 sm:py-24 flex flex-col items-center text-center gap-6">
        <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
          Now live — deploy your first bot free
        </Badge>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight max-w-3xl">
          Mission Control for{" "}
          <span className="text-primary">Discord Bots</span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-xl">
          Deploy, manage, and scale your bots without touching Heroku directly.
          A precise, powerful cockpit for bot operators.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto gap-2" asChild>
            <Link href={ctaHref}>
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href={templatesHref}>Browse Templates</Link>
          </Button>
        </div>

        {/* Feature checklist */}
        <ul className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground mt-2">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Feature cards ── */}
      <section className="container mx-auto px-4 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-6 flex flex-col gap-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA banner ── */}
      <section className="container mx-auto px-4 pb-20">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:p-12 flex flex-col items-center text-center gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to deploy your bot?</h2>
          <p className="text-muted-foreground max-w-md">
            Join hundreds of bot developers already using JuneXHostingPlatform. Free to start, scales with you.
          </p>
          <Button size="lg" className="mt-2 gap-2" asChild>
            <Link href={ctaHref}>
              {ctaLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
}


