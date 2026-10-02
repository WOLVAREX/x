import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Terminal, Zap, KeyRound, CreditCard, Bot, Server,
  Github, Globe, ChevronRight, BookOpen,
} from "lucide-react";

const sections = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Zap,
    content: [
      {
        heading: "What is J.H.P?",
        body: "J.H.P is a managed bot deployment platform. It lets you deploy, manage, and scale WhatsApp and Discord bots without managing the hosting account directly.",
      },
      {
        heading: "Create an Account",
        body: "Sign up at /register using your email or continue with Google or GitHub. The first thing you should do after signing up is top up your wallet so you can deploy bots.",
      },
      {
        heading: "Top Up Your Wallet",
        body: "Go to Payments in the navbar. Click Add Funds, choose an amount, and pay via Card (all countries) or M-Pesa STK Push (Kenya). Your balance updates automatically after payment.",
      },
    ],
  },
  {
    id: "deploying-bots",
    title: "Deploying Bots",
    icon: Bot,
    content: [
      {
        heading: "Browse Templates",
        body: "Go to Templates and pick a bot. Each card shows the bot name, price, and category. Click Deploy to open the configuration page.",
      },
      {
        heading: "Configure Your Bot",
        body: "Fill in your Bot Name and all required environment variables (e.g. SESSION_ID, DATABASE_URL). These are specific to each bot template and are shown with descriptions.",
      },
      {
        heading: "Deploy",
        body: "Click Deploy Bot. Your wallet is charged automatically if the template is paid. You are taken to the logs page where you can watch the deployment progress in real time. The bot goes live on Heroku when deployment is complete.",
      },
    ],
  },
  {
    id: "managing-bots",
    title: "Managing Bots",
    icon: Server,
    content: [
      {
        heading: "My Bots Page",
        body: "The My Bots page shows all your deployed bots. From here you can Start, Stop, Restart, view Logs, or Delete any bot.",
      },
      {
        heading: "Viewing Logs",
        body: "Click the Logs button on any bot card or go to the deployment detail page. Logs show both J.H.P deployment history and live bot logs so you can debug issues.",
      },
      {
        heading: "Editing Configuration",
        body: "On the deployment detail page, go to the Configuration tab. You can edit any environment variable (e.g. update your SESSION_ID). Click Save & Restart to push changes to Heroku and restart your bot immediately.",
      },
      {
        heading: "Deleting a Bot",
        body: "Deleting a bot from J.H.P also removes its hosting app permanently. This action cannot be undone. Your wallet is not refunded for deleted bots.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & Wallet",
    icon: CreditCard,
    content: [
      {
        heading: "Wallet Model",
        body: "J.H.P uses a pre-paid wallet model. You deposit funds first, then spend them deploying bots. There are no recurring charges — you pay per deployment.",
      },
      {
        heading: "Supported Payment Methods",
        body: "Card payments (Visa, Mastercard, and more) are available worldwide. M-Pesa STK Push is available for Safaricom Kenya users. All payments are processed securely by Paystack.",
      },
      {
        heading: "Payment Verification",
        body: "Card payments are verified instantly via the Paystack popup. M-Pesa payments are auto-verified — your wallet updates as soon as you enter your PIN and Paystack confirms the transaction.",
      },
    ],
  },
  {
    id: "env-vars",
    title: "Environment Variables",
    icon: KeyRound,
    content: [
      {
        heading: "What Are Env Vars?",
        body: "Environment variables are configuration values your bot needs to run, such as API tokens, database URLs, or session IDs. They are set per-deployment and stored securely on Heroku.",
      },
      {
        heading: "Setting Env Vars",
        body: "Fill them in on the deployment configuration page before clicking Deploy. You can update them later from the Configuration tab on the deployment detail page.",
      },
      {
        heading: "Security",
        body: "Environment variables are stored securely by the hosting provider and are not exposed in the J.H.P UI after initial setup. Values are masked in the configuration editor.",
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <Layout>
      <div className="container max-w-5xl px-4 py-12 mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">Documentation</Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">J.H.P Documentation</h1>
          <p className="text-muted-foreground max-w-2xl">
            Everything you need to deploy and manage your bots on J.H.P.
          </p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-12">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="flex items-center gap-2 p-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all text-sm font-medium group">
              <s.icon className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="truncate">{s.title}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto group-hover:text-primary transition-colors flex-shrink-0" />
            </a>
          ))}
        </div>

        {/* Sections */}
        <div className="space-y-16">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-20">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <section.icon className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-xl font-bold">{section.title}</h2>
              </div>
              <div className="space-y-6 ml-12">
                {section.content.map((item) => (
                  <div key={item.heading} className="border-l-2 border-border/40 pl-5 hover:border-primary/40 transition-colors">
                    <h3 className="font-semibold text-sm mb-2">{item.heading}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-16 p-6 rounded-2xl border border-primary/20 bg-primary/5 text-center">
          <p className="text-sm text-muted-foreground mb-3">Still have questions?</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/developers" className="text-sm text-primary hover:underline flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" /> Meet the Team
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1">
              <Github className="h-3.5 w-3.5" /> GitHub
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
