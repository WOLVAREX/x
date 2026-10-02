import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Search, Shield, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { useListAdminUsers, getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";

function authHeader() {
  const token = localStorage.getItem("junex_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function AdminDevelopersPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading, isError } = useListAdminUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const developers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users ?? []).filter((account) =>
      account.username.toLowerCase().includes(query) || account.email.toLowerCase().includes(query),
    );
  }, [users, search]);
  const adminCount = users?.filter((account) => account.role === "admin").length ?? 0;

  async function updateRole(id: number, role: "admin" | "user") {
    setUpdatingId(id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${id}/role`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update account access");
      await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      toast({
        title: role === "admin" ? "Developer access granted" : "Admin access removed",
        description: `${data.username} now has ${role} access.`,
      });
    } catch (error) {
      toast({
        title: "Could not update access",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <Link href="/admin" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to admin dashboard
        </Link>

        <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-8">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-primary"><UserRoundCog className="h-5 w-5" /><span className="text-sm font-medium">Platform administration</span></div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Developer access</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage administrator access for registered accounts and platform settings.</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-64">
              <div className="rounded-xl border border-border/60 bg-background/70 p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span className="text-xs sm:text-sm">Accounts</span></div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : users?.length ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /><span className="text-xs sm:text-sm">Administrators</span></div>
                <div className="mt-1 text-xl font-semibold sm:text-2xl">{adminCount}</div>
              </div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="gap-4 border-b border-border/50 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0"><CardTitle>Accounts</CardTitle><CardDescription className="mt-1">Grant administrator access to trusted developers. At least one administrator must remain.</CardDescription></div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" aria-label="Search accounts" className="h-10 pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : isError ? (
              <div className="p-8 text-center text-sm text-destructive">Could not load accounts. Refresh the page and try again.</div>
            ) : (
              <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="pl-6">Account</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="pr-6 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {developers.map((account) => {
                      const isAdmin = account.role === "admin";
                      const isSelf = account.id === currentUser?.id;
                      const cannotRemoveLastAdmin = isAdmin && adminCount <= 1;
                      return (
                        <TableRow key={account.id} className="border-border/40">
                          <TableCell className="pl-6">
                            <div className="font-medium">{account.username}</div>
                            <div className="text-xs text-muted-foreground">Account #{account.id}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{account.email}</TableCell>
                          <TableCell>
                            <Badge variant={isAdmin ? "default" : "outline"} className={isAdmin ? "gap-1 bg-primary/15 text-primary hover:bg-primary/15" : ""}>
                              {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                              {isAdmin ? "Admin" : "User"}
                            </Badge>
                            {isSelf && <span className="ml-2 text-xs text-muted-foreground">You</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {format(new Date(account.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Button
                              size="sm"
                              variant={isAdmin ? "outline" : "default"}
                              disabled={updatingId !== null || (isAdmin && (isSelf || cannotRemoveLastAdmin))}
                              title={isSelf ? "You cannot remove your own admin access here" : cannotRemoveLastAdmin ? "At least one admin must remain" : undefined}
                              onClick={() => updateRole(account.id, isAdmin ? "user" : "admin")}
                            >
                              {updatingId === account.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              {isAdmin ? "Remove admin" : "Make admin"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {developers.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No matching accounts.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 p-3 md:hidden">
                {developers.map((account) => {
                  const isAdmin = account.role === "admin";
                  const isSelf = account.id === currentUser?.id;
                  const cannotRemoveLastAdmin = isAdmin && adminCount <= 1;
                  return <div key={account.id} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate font-medium">{account.username}</div><div className="mt-0.5 break-all text-sm text-muted-foreground">{account.email}</div></div>
                      <Badge variant={isAdmin ? "default" : "outline"} className={isAdmin ? "shrink-0 gap-1 bg-primary/15 text-primary hover:bg-primary/15" : "shrink-0"}>
                        {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}{isAdmin ? "Admin" : "User"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>Account #{account.id}{isSelf ? " · You" : ""}</span><span>Joined {format(new Date(account.createdAt), "MMM d, yyyy")}</span>
                    </div>
                    <Button className="mt-4 w-full" size="sm" variant={isAdmin ? "outline" : "default"}
                      disabled={updatingId !== null || (isAdmin && (isSelf || cannotRemoveLastAdmin))}
                      title={isSelf ? "You cannot remove your own admin access here" : cannotRemoveLastAdmin ? "At least one admin must remain" : undefined}
                      onClick={() => updateRole(account.id, isAdmin ? "user" : "admin")}>
                      {updatingId === account.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{isAdmin ? "Remove admin access" : "Make administrator"}
                    </Button>
                  </div>;
                })}
                {developers.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">No matching accounts.</div>}
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
