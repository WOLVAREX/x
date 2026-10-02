import { useQuery } from "@tanstack/react-query";
import { Github, Linkedin, ExternalLink, Loader2, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  imageUrl: string | null;
  links: Array<{ label: string; url: string }>;
};

function getLinkIcon(label: string) {
  if (/github/i.test(label)) return <Github className="h-4 w-4" />;
  if (/linkedin/i.test(label)) return <Linkedin className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4" />;
}

export default function DevelopersPage() {
  const { data: members = [], isLoading, isError } = useQuery<TeamMember[]>({
    queryKey: ["team"],
    queryFn: async () => {
      const response = await fetch("/api/team");
      if (!response.ok) throw new Error("Could not load the team");
      return response.json();
    },
  });

  return (
    <Layout>
      <main className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <Badge variant="outline" className="mb-4 gap-2 px-3 py-1.5"><Users className="h-3.5 w-3.5 text-primary" /> WOLF TECH · JuneX Hosting Platform</Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meet the team</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">The people who created and build the JuneX Hosting Platform.</p>
        </header>

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading team" /></div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">We could not load the team right now. Please try again later.</div>
        ) : members.length ? (
          <section aria-label="JuneX project creators" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <Card key={member.id} className="h-full overflow-hidden border-border/60 transition-colors hover:border-primary/30">
                <CardContent className="flex h-full flex-col items-center p-6 text-center sm:p-7">
                  <Avatar className="h-28 w-28 border-2 border-primary/20 shadow-sm">
                    <AvatarImage src={member.imageUrl ?? undefined} alt={member.name} className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">{member.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <h2 className="mt-5 text-lg font-semibold">{member.name}</h2>
                  <p className="mt-1 text-sm font-medium text-primary">{member.role}</p>
                  {member.bio && <p className="mt-4 flex-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{member.bio}</p>}
                  {member.links.length > 0 && <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-border/50 pt-4">{member.links.map((link) => <a key={`${member.id}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border/60 px-3 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">{getLinkIcon(link.label)}<span>{link.label}</span></a>)}</div>}
                </CardContent>
              </Card>
            ))}
          </section>
        ) : (
          <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
            <h2 className="mt-4 font-semibold">Team profiles are coming soon</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">We’re preparing the profiles of the people behind JuneX Hosting Platform.</p>
          </div>
        )}
      </main>
    </Layout>
  );
}
