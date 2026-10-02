import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Terminal } from "lucide-react";

const registerSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  country: z.enum(["KE", "NG", "GH", "ZA", "CI", "OTHER"], { message: "Choose your country" }),
});

export default function Register() {
  const [, navigate] = useLocation();
  const { user, login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user]);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "", country: "KE" },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        login(data.user, data.token);
        toast({ title: "Account created", description: "Welcome to JXHP!" });
        navigate("/dashboard");
      },
      onError: (error: any) => {
        toast({
          title: "Registration failed",
          description: error.data?.error || "Failed to create account. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerMutation.mutate({ data: values } as any);
  }

  return (
    <Layout>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-[420px] mx-auto">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Terminal className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl tracking-tight">Create an account</CardTitle>
            <CardDescription>Enter your information below to create your account</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <OAuthButtons />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or with email</span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <select {...field} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="KE">Kenya — KES</option>
                          <option value="NG">Nigeria — NGN</option>
                          <option value="GH">Ghana — GHS</option>
                          <option value="ZA">South Africa — ZAR</option>
                          <option value="CI">Côte d’Ivoire — XOF</option>
                          <option value="OTHER">Other countries — KES checkout</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">All Paystack checkouts use KES. Your wallet earns 5 coins per KES 1.</p>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="supreme" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="Min. 6 characters" type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary underline-offset-4 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
}



