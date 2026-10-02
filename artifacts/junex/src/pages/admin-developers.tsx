import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Github, ImagePlus, Linkedin, Loader2, Plus, Search, Shield, ShieldCheck, Trash2, UserRoundCog, Users, X } from "lucide-react";
import { useListAdminUsers, getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : "";
type TeamLink = { label: string; url: string };
type TeamMember = { id: string; name: string; role: string; bio: string; imageUrl: string | null; links: TeamLink[] };
type MemberDraft = Omit<TeamMember, "id"> & { id?: string };
const emptyDraft: MemberDraft = { name: "", role: "", bio: "", imageUrl: null, links: [] };

function authHeaders(json = true) {
  const token = localStorage.getItem("junex_token");
  return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` };
}

function linkIcon(label: string) {
  if (/github/i.test(label)) return <Github className="h-4 w-4" />;
  if (/linkedin/i.test(label)) return <Linkedin className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4" />;
}

export default function AdminDevelopersPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading, isError } = useListAdminUsers();
  const { data: members = [], isLoading: isLoadingMembers, isError: isMembersError } = useQuery<TeamMember[]>({
    queryKey: ["admin", "team"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/admin/team`, { headers: authHeaders(false) });
      if (!response.ok) throw new Error("Could not load team profiles");
      return response.json();
    },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const accounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users ?? []).filter((account) => account.username.toLowerCase().includes(query) || account.email.toLowerCase().includes(query));
  }, [users, search]);
  const adminCount = users?.filter((account) => account.role === "admin").length ?? 0;

  useEffect(() => {
    return () => {
      if (draft.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(draft.imageUrl);
    };
  }, [draft.imageUrl]);

  async function updateRole(id: number, role: "admin" | "user") {
    setUpdatingId(id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${id}/role`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ role }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update account access");
      await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      toast({ title: role === "admin" ? "Admin access granted" : "Admin access removed", description: `${data.username} now has ${role} access.` });
    } catch (error) {
      toast({ title: "Could not update access", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setUpdatingId(null); }
  }

  function editMember(member: TeamMember) {
    setEditingId(member.id);
    setDraft({ ...member, links: member.links.map((link) => ({ ...link })) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      toast({ title: "Unsupported image", description: "Choose a PNG, JPEG, or WebP image.", variant: "destructive" }); return;
    }
    if (file.size > 1_500_000) {
      toast({ title: "Image is too large", description: "Use an image smaller than 1.5 MB.", variant: "destructive" }); return;
    }
    setIsUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the image"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const [header, data] = dataUrl.split(",", 2);
      const contentType = header.match(/^data:(image\/(?:png|jpeg|webp));base64$/)?.[1];
      if (!contentType || !data) throw new Error("Could not read the image format");
      const response = await fetch(`${API_BASE}/api/admin/team/image`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ contentType, data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not upload image");
      setDraft((current) => ({ ...current, imageUrl: result.imageUrl }));
      toast({ title: "Profile image uploaded" });
    } catch (error) {
      toast({ title: "Image upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setIsUploading(false); }
  }

  async function saveTeam(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.role.trim()) return;
    const nextMember: TeamMember = { ...draft, id: editingId ?? crypto.randomUUID(), name: draft.name.trim(), role: draft.role.trim(), bio: draft.bio.trim(), links: draft.links.filter((link) => link.label.trim() && link.url.trim()) };
    const nextMembers = editingId ? members.map((member) => member.id === editingId ? nextMember : member) : [...members, nextMember];
    setIsSavingTeam(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/team`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ members: nextMembers }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save team profiles");
      queryClient.setQueryData(["admin", "team"], result);
      queryClient.setQueryData(["team"], result);
      setDraft(emptyDraft); setEditingId(null);
      toast({ title: editingId ? "Team profile updated" : "Team member added" });
    } catch (error) {
      toast({ title: "Could not save team profile", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setIsSavingTeam(false); }
  }

  async function deleteMember(id: string) {
    const nextMembers = members.filter((member) => member.id !== id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/team`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ members: nextMembers }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not remove team member");
      queryClient.setQueryData(["admin", "team"], result); queryClient.setQueryData(["team"], result);
      if (editingId === id) { setDraft(emptyDraft); setEditingId(null); }
      toast({ title: "Team member removed" });
    } catch (error) {
      toast({ title: "Could not remove team member", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  function cancelEdit() { setDraft(emptyDraft); setEditingId(null); }

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <Link href="/admin" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to admin dashboard</Link>
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-primary"><UserRoundCog className="h-5 w-5" /><span className="text-sm font-medium">Platform administration</span></div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Manage developers</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Publish the people behind JuneX and manage who has administrator access.</p></div>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-64"><div className="rounded-xl border border-border/60 bg-background/70 p-3 sm:p-4"><div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span className="text-xs sm:text-sm">Team members</span></div><div className="mt-1 text-xl font-semibold sm:text-2xl">{members.length}</div></div><div className="rounded-xl border border-border/60 bg-background/70 p-3 sm:p-4"><div className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /><span className="text-xs sm:text-sm">Administrators</span></div><div className="mt-1 text-xl font-semibold sm:text-2xl">{adminCount}</div></div></div>
          </div>
        </div>

        <Tabs defaultValue="team" className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:w-96"><TabsTrigger value="team">Team profiles</TabsTrigger><TabsTrigger value="access">Admin access</TabsTrigger></TabsList>
          <TabsContent value="team" className="space-y-5">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="border-b border-border/50 bg-muted/20 p-4 sm:p-6"><CardTitle>{editingId ? "Edit team profile" : "Add a team member"}</CardTitle><CardDescription>This profile appears as a card on the public Team page.</CardDescription></CardHeader>
              <CardContent className="p-4 sm:p-6">
                <form onSubmit={saveTeam} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid content-start gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-medium">Name<Input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Full name" /></label>
                    <label className="space-y-1.5 text-sm font-medium">Role on the project<Input required maxLength={120} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="e.g. Founder & Lead Developer" /></label>
                    <label className="space-y-1.5 text-sm font-medium sm:col-span-2">About<Textarea maxLength={1000} rows={3} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="A short introduction and what they worked on" /></label>
                    <div className="space-y-3 sm:col-span-2">
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Links</span><Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}><Plus className="h-4 w-4" /> Add link</Button></div>
                      {draft.links.map((link, index) => <div key={index} className="grid grid-cols-[minmax(85px,0.35fr)_minmax(0,1fr)_36px] gap-2"><Input aria-label="Link label" value={link.label} placeholder="GitHub" onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><Input aria-label="Link URL" type="url" value={link.url} placeholder="https://..." onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} /><Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}><X className="h-4 w-4" /></Button></div>)}
                      {!draft.links.length && <p className="text-xs text-muted-foreground">Add GitHub, LinkedIn, portfolio, or other public links.</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-4">
                    <Avatar className="h-28 w-28 border border-border"><AvatarImage src={draft.imageUrl ?? undefined} className="object-cover" /><AvatarFallback className="bg-primary/10 text-primary"><Users className="h-9 w-9" /></AvatarFallback></Avatar>
                    <label className="w-full cursor-pointer"><span className="flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"><ImagePlus className="h-4 w-4" />{isUploading ? "Uploading…" : "Upload photo"}</span><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                    <p className="text-center text-xs leading-5 text-muted-foreground">PNG, JPEG, or WebP · max 1.5 MB</p>
                    {draft.imageUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, imageUrl: null })}>Remove photo</Button>}
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end"><Button type="submit" disabled={isSavingTeam || isUploading} className="gap-2">{isSavingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingId ? "Save changes" : "Add to team page"}</Button>{editingId && <Button type="button" variant="outline" onClick={cancelEdit}>Cancel</Button>}</div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm"><CardHeader className="p-4 sm:p-6"><CardTitle>Published team members</CardTitle><CardDescription>These profiles are visible to everyone on the Team page.</CardDescription></CardHeader><CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoadingMembers ? <div className="flex h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : isMembersError ? <p className="py-8 text-center text-sm text-destructive">Could not load team profiles.</p> : members.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{members.map((member) => <article key={member.id} className="flex min-w-0 gap-3 rounded-xl border border-border/60 p-4"><Avatar className="h-12 w-12 shrink-0"><AvatarImage src={member.imageUrl ?? undefined} className="object-cover" /><AvatarFallback className="bg-primary/10 text-primary">{member.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.role}</p><div className="mt-2 flex flex-wrap gap-2">{member.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" aria-label={`${member.name}: ${link.label}`} className="text-muted-foreground hover:text-primary">{linkIcon(link.label)}</a>)}</div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => editMember(member)}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Remove ${member.name}`} onClick={() => void deleteMember(member.id)}><Trash2 className="h-4 w-4" /></Button></div></div></article>)}</div> : <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 font-medium">The team page is waiting for its first profile</p><p className="mt-1 text-sm text-muted-foreground">Add the project creators above to publish their cards.</p></div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="access">
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="gap-4 border-b border-border/50 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="min-w-0"><CardTitle>Administrator access</CardTitle><CardDescription className="mt-1">At least one administrator must remain. You cannot remove your own access.</CardDescription></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" aria-label="Search accounts" className="h-10 pl-9" /></div></CardHeader>
              <CardContent className="p-0">{isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : isError ? <div className="p-8 text-center text-sm text-destructive">Could not load accounts. Refresh the page and try again.</div> : <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead className="pl-6">Account</TableHead><TableHead>Email</TableHead><TableHead>Access</TableHead><TableHead>Joined</TableHead><TableHead className="pr-6 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => { const isAdmin = account.role === "admin"; const isSelf = account.id === currentUser?.id; const cannotRemoveLastAdmin = isAdmin && adminCount <= 1; return <TableRow key={account.id}><TableCell className="pl-6"><div className="font-medium">{account.username}</div><div className="text-xs text-muted-foreground">Account #{account.id}</div></TableCell><TableCell className="text-sm text-muted-foreground">{account.email}</TableCell><TableCell><Badge variant={isAdmin ? "default" : "outline"} className={isAdmin ? "gap-1 bg-primary/15 text-primary hover:bg-primary/15" : ""}>{isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}{isAdmin ? "Admin" : "User"}</Badge>{isSelf && <span className="ml-2 text-xs text-muted-foreground">You</span>}</TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{format(new Date(account.createdAt), "MMM d, yyyy")}</TableCell><TableCell className="pr-6 text-right"><Button size="sm" variant={isAdmin ? "outline" : "default"} disabled={updatingId !== null || (isAdmin && (isSelf || cannotRemoveLastAdmin))} onClick={() => void updateRole(account.id, isAdmin ? "user" : "admin")}>{updatingId === account.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{isAdmin ? "Remove admin" : "Make admin"}</Button></TableCell></TableRow>; })}{accounts.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No matching accounts.</TableCell></TableRow>}</TableBody></Table></div><div className="space-y-3 p-3 md:hidden">{accounts.map((account) => { const isAdmin = account.role === "admin"; const isSelf = account.id === currentUser?.id; const cannotRemoveLastAdmin = isAdmin && adminCount <= 1; return <div key={account.id} className="rounded-xl border border-border/60 p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{account.username}</div><div className="mt-0.5 break-all text-sm text-muted-foreground">{account.email}</div></div><Badge variant={isAdmin ? "default" : "outline"}>{isAdmin ? "Admin" : "User"}</Badge></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Account #{account.id}{isSelf ? " · You" : ""}</span><span>{format(new Date(account.createdAt), "MMM d, yyyy")}</span></div><Button className="mt-4 w-full" size="sm" variant={isAdmin ? "outline" : "default"} disabled={updatingId !== null || (isAdmin && (isSelf || cannotRemoveLastAdmin))} onClick={() => void updateRole(account.id, isAdmin ? "user" : "admin")}>{isAdmin ? "Remove admin access" : "Make administrator"}</Button></div>; })}{!accounts.length && <div className="py-10 text-center text-sm text-muted-foreground">No matching accounts.</div>}</div></>}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
