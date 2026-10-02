import { Link } from "wouter";
import { ArrowRight, Bot, Code2, LifeBuoy, ShieldCheck, Terminal, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const principles = [
  { icon: Code2, title: "Built for developers", description: "A straightforward workspace for deploying and managing bot projects." },
  { icon: ShieldCheck, title: "Access with care", description: "Account controls and deployment settings help keep platform access organized." },
  { icon: LifeBuoy, title: "Help when you need it", description: "Read the guides for setup details and answers to common questions." },
];

export default function DevelopersPage() {
  return (
    <Layout>
      <main>
        <section className="container mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center sm:py-24">
          <Badge variant="outline" className="mb-5 gap-2 px-3 py-1.5">
            <Users className="h-3.5 w-3.5 text-primary" /> WOLF TECH · JuneX Hosting Platform
          </Badge>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Terminal className="h-8 w-8 text-primary" />
          </div>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Tools for the people who build bots</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            JuneX Hosting Platform makes it easier to deploy, configure, and look after bot projects from one clear workspace.
          </p>
          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" className="gap-2" asChild><Link href="/register">Get started <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button size="lg" variant="outline" className="gap-2" asChild><Link href="/docs"><Bot className="h-4 w-4" /> Read the docs</Link></Button>
          </div>
        </section>

        <section className="container mx-auto max-w-6xl px-4 pb-16 sm:pb-24" aria-label="Platform principles">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="h-full border-border/60 bg-card/70">
                <CardHeader className="gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">{description}</CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center sm:p-9">
            <h2 className="text-xl font-semibold sm:text-2xl">Start building with JuneX</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Create an account to explore bot templates, deploy a project, and manage it from your dashboard.</p>
            <Button variant="link" className="mt-2 gap-2" asChild><Link href="/templates">Explore templates <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </section>
      </main>
    </Layout>
  );
}
