import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListTemplates, useListTemplateCategories } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Github, Bot, Zap, Gift, Globe, Coins, Star, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

const TEMPLATES_PER_PAGE = 10;

export default function Templates() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 500);

  const { data: templates, isLoading } = useListTemplates({ search: debouncedSearch || undefined, category });
  const { data: categories } = useListTemplateCategories();
  const templateList = templates ?? [];
  const totalPages = Math.max(1, Math.ceil(templateList.length / TEMPLATES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstTemplate = (currentPage - 1) * TEMPLATES_PER_PAGE;
  const visibleTemplates = templateList.slice(firstTemplate, firstTemplate + TEMPLATES_PER_PAGE);

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
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant={!category ? "default" : "outline"}
              className="cursor-pointer text-xs py-1.5 px-3 whitespace-nowrap"
              onClick={() => { setCategory(undefined); setPage(1); }}>All</Badge>
            {categories?.map((cat) => (
              <Badge key={cat} variant={category === cat ? "default" : "outline"}
                className="cursor-pointer text-xs py-1.5 px-3 whitespace-nowrap"
                onClick={() => { setCategory(cat); setPage(1); }}>{cat}</Badge>
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
            <Button variant="link" onClick={() => { setSearch(""); setCategory(undefined); setPage(1); }}>Clear filters</Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTemplates.map((template) => (
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
                            <Gift className="h-3 w-3" /> No template fee
                          </Badge>
                        ) : (
                          <Badge className="bg-primary/15 text-primary border-primary/20 flex-shrink-0 text-xs">
                            <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" /> Hosting plan</span>
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs mt-1">{template.category}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                  {(template.isFeatured || template.showDeployCount) && <div className="mt-3 flex flex-wrap gap-2">
                    {template.isFeatured && <Badge className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-300"><Star className="h-3 w-3 fill-current" /> Featured on J.H.P</Badge>}
                    {template.showDeployCount && <Badge variant="secondary" className="gap-1"><Activity className="h-3 w-3" />{template.deployCount ?? 0} Deploys</Badge>}
                  </div>}
                </div>

                {/* Action buttons */}
                <div className="px-5 pb-5 flex gap-2 flex-wrap">
                  <Button size="sm" className="gap-1.5 flex-1" asChild>
                    <Link href={`/templates/${template.slug}`}>
                      <Zap className="h-3.5 w-3.5" /> Deploy
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 flex-1 px-2" asChild>
                    <a href={template.githubRepo} target="_blank" rel="noopener noreferrer">
                      <Github className="h-3.5 w-3.5" /> Git
                    </a>
                  </Button>
                  {template.pairSiteUrl && (
                    <Button size="sm" variant="outline" className="gap-1.5 flex-1 px-2" asChild>
                      <a href={template.pairSiteUrl} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-3.5 w-3.5" /> Pair
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-5 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Showing {firstTemplate + 1}-{Math.min(firstTemplate + TEMPLATES_PER_PAGE, templateList.length)} of {templateList.length} templates
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={currentPage === 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <span className="min-w-24 text-center text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}


