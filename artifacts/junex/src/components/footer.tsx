import { Link } from "wouter";
import { Terminal } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-background/95">
      <div className="container px-4 md:px-8 py-8 mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">J.H.P</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              J.H.P — deploy and manage your bots with ease.
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</p>
            <ul className="space-y-2">
              {[
                { href: "/templates", label: "Templates" },
                { href: "/docs", label: "Documentation" },
                { href: "/integration", label: "Integration" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Account</p>
            <ul className="space-y-2">
              {[
                { href: "/login", label: "Sign In" },
                { href: "/register", label: "Sign Up" },
                { href: "/wallet", label: "Wallet" },
                { href: "/my-bots", label: "My Bots" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Legal</p>
            <ul className="space-y-2">
              {[
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/terms", label: "Terms of Service" },
                { href: "/docs", label: "Docs" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            &copy; {year} WOLF TECH. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link href="/docs" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
