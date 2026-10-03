import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
  Moon, Sun, Terminal, Menu, X, Code2,
  LayoutDashboard, Grid3X3, ShieldCheck, LifeBuoy,
  LogOut, LogIn, UserPlus, Wallet, Bot,
} from "lucide-react";

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    ...(user ? [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/my-bots", label: "My Bots", icon: Bot },
      { href: "/recover", label: "Recover", icon: LifeBuoy },
    ] : []),
    { href: "/templates", label: "Templates", icon: Grid3X3 },
    { href: "/integration", label: "Integration", icon: Code2 },
    ...(user ? [{ href: "/wallet", label: "Payments", icon: Wallet }] : []),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  function isActive(href: string) {
    return location === href || location.startsWith(href + "/");
  }

  return (
    <>
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8">
          <Link href="/" className="mr-6 flex items-center space-x-2 flex-shrink-0" onClick={() => setMobileOpen(false)}>
            <Terminal className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm sm:text-base">J.H.P</span>
          </Link>
          <div className="hidden md:flex flex-1 items-center gap-1">
            {!user && navLinks.map((link) => (
              <Link key={link.href} href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(link.href) ? "bg-primary/10 text-primary" : "text-foreground/60 hover:text-foreground hover:bg-muted"
                }`}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="icon" className="h-9 w-9"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <Button variant="outline" size="sm" onClick={() => logout()} className="gap-2">
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/login"><LogIn className="h-3.5 w-3.5 mr-1.5" />Log in</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/register"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Sign up</Link>
                  </Button>
                </>
              )}
            </div>
            {user ? (
              <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" aria-label="Log out" onClick={() => logout()}>
                <LogOut className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileOpen((v) => !v)}>
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            )}
          </div>
        </div>
      </nav>
      {mobileOpen && !user && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-16 left-0 right-0 bg-background border-b border-border/40 shadow-xl">
            <div className="container px-4 py-4 space-y-1">
              {!user && navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive(link.href) ? "bg-primary/10 text-primary" : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`}>
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-3 border-t border-border/40">
                {!user ? (
                  <div className="flex flex-col gap-2">
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full gap-2"><LogIn className="h-4 w-4" /> Log in</Button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full gap-2"><UserPlus className="h-4 w-4" /> Sign up</Button>
                    </Link>
                  </div>
                ) : <button onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="h-4 w-4" /> Log out
                </button>}
              </div>
            </div>
          </div>
        </div>
      )}
      {user && (
        <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-18px_rgba(0,0,0,0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="mx-auto flex h-16 max-w-screen-2xl items-stretch justify-around overflow-x-auto px-1 sm:px-4 md:h-[4.5rem] md:px-8">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
                className={`flex min-w-[3.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors sm:min-w-[4rem] sm:text-xs ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <span className={`flex h-8 w-11 items-center justify-center rounded-2xl transition-colors md:h-9 md:w-14 ${active ? "bg-primary/10" : ""}`}><link.icon className="h-[18px] w-[18px]" /></span>
                <span className="max-w-full truncate leading-none">{link.label}</span>
              </Link>;
            })}
          </div>
        </nav>
      )}
    </>
  );
}
