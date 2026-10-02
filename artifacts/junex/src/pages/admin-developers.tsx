import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Search, Shield, ShieldCheck, UserRoundCog } from "lucide-react";
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
      <div className="container max-w-6xl px-4 py-10 sm:py-14">
        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to admin dashboard
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <UserRoundCog className="h-5 w-5" />
              <span className="text-sm font-medium">Platform administration</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Developer access</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Manage which registered accounts can access the admin dashboard and platform settings.
            </p>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> {adminCount} administrator{adminCount === 1 ? "" : "s"}
          </Badge>
        </div>

        <Card className="border-border/50">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription className="mt-1">Grant admin access to trusted developers. At least one administrator must remain.</CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : isError ? (
              <div className="p-8 text-center text-sm text-destructive">Could not load accounts. Refresh the page and try again.</div>
            ) : (
              <div className="overflow-x-auto">
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
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
