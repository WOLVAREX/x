import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListTemplates, useListTemplateCategories } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Github, Bot, ExternalLink, Zap, CreditCard, Gift, Globe } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

function fmt(price: number, currency: string) {
  return `${currency} ${(price / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function Templates() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const debouncedSearch = useDebounce(search, 500);

  const { data: templates, isLoading } = useListTemplates({ search: debouncedSearch || undefined, category });
  const { data: categories } = useListTemplateCategories();

  return (
    <Layout>
      <div className="container px-4 md:px-8 py-6 md:py-10 mx-auto max-w-6xl">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Bot Templates</h1>
          <p className="text-muted-foreground mt-1 text-sm">Deploy production-ready bots in seconds.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search templates..." className="pl-9"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant={!category ? "default" : "outline"}
              className="cursor-pointer text-xs py-1.5 px-3 whitespace-nowrap"
              onClick={() => setCategory(undefined)}>All</Badge>
            {categories?.map((cat) => (
              <Badge key={cat} variant={category === cat ? "default" : "outline"}
                className="cursor-pointer text-xs py-1.5 px-3 whitespace-nowrap"
                onClick={() => setCategory(cat)}>{cat}</Badge>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates?.length === 0 ? (
          <div className="text-center py-20 border rounded-xl border-dashed bg-muted/20">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-base font-medium text-muted-foreground">No templates found</p>
            <Button variant="link" onClick={() => { setSearch(""); setCategory(undefined); }}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {templates?.map((template) => (
              <div key={template.id}
                className="rounded-xl border border-border/40 bg-card hover:border-primary/30 hover:shadow-md transition-all flex flex-col">
                <div className="p-4 flex-1">
                  {/* Icon + name row */}
                  <div className="flex items-start gap-3 mb-2">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/30">
                      {template.thumbnail ? (
                        <img
                          src={template.thumbnail}
                          alt={template.name}
                          className="h-full w-full object-cover rounded-xl"
                          onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            img.style.display = "none";
                            const fb = img.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.removeProperty("display");
                          }}
                        />
                      ) : null}
                      <Bot
                        className="h-5 w-5 text-primary/60"
                        style={{ display: template.thumbnail ? "none" : undefined }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-snug">{template.name}</h3>
                        {(template.isFree || template.price === 0) ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 gap-1 flex-shrink-0 text-xs">
                            <Gift className="h-3 w-3" /> Free
                          </Badge>
                        ) : (
                          <Badge className="bg-primary/15 text-primary border-primary/20 flex-shrink-0 text-xs">
                            {fmt(template.price, template.currency)}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs mt-1">{template.category}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                </div>

                {/* Action buttons */}
                <div className="px-5 pb-5 flex gap-2 flex-wrap">
                  <Button size="sm" className="gap-1.5 flex-1" asChild>
                    <Link href={`/templates/${template.slug}`}>
                      <Zap className="h-3.5 w-3.5" /> Deploy
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 px-3" asChild>
                    <a href={template.githubRepo} target="_blank" rel="noopener noreferrer">
                      <Github className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  {template.pairSiteUrl && (
                    <Button size="sm" variant="outline" className="gap-1.5 px-3" asChild>
                      <a href={template.pairSiteUrl} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}


