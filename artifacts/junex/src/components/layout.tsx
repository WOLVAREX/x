import { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { useAuth } from "@/hooks/use-auth";

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className={`relative flex min-h-[100dvh] flex-col bg-background font-sans antialiased ${user ? "pb-20 md:pb-24" : ""}`}>
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

