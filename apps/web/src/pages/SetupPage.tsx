import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, Shield, Loader2 } from "lucide-react";

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ completed: boolean }>("/api/v1/setup/status")
      .then((result) => {
        if (result.completed) {
          navigate("/login");
        }
      })
      .finally(() => setStatusLoading(false));
  }, []);

  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-up">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Checking setup status...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username, password })
      });
      navigate("/login");
    } catch (setupError) {
      setError(String(setupError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Decorative left panel -- hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-primary/[0.06] via-primary/[0.03] to-background items-center justify-center">
        {/* Abstract book spine pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              currentColor 0px,
              currentColor 2px,
              transparent 2px,
              transparent 20px
            )`,
            backgroundSize: "20px 100%",
          }}
        />
        {/* Floating decorative elements */}
        <div className="absolute top-1/4 left-1/4 size-64 rounded-full bg-primary/[0.04] blur-[80px]" />
        <div className="absolute bottom-1/3 right-1/4 size-48 rounded-full bg-primary/[0.06] blur-[60px]" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center animate-fade-up">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 shadow-[0_8px_32px_-8px] shadow-primary/15">
            <Book className="size-10 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">BookLite</h1>
            <p className="text-muted-foreground/70 text-[15px] leading-relaxed max-w-xs">
              Welcome. Let's set up<br />your personal library.
            </p>
          </div>
        </div>

        {/* Bottom edge gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
        {/* Right edge gradient fade */}
        <div className="absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md animate-fade-up">
          {/* Mobile-only branding */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/12 to-primary/5 shadow-sm shadow-primary/10">
              <Book className="size-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">BookLite</h1>
            <p className="text-sm text-muted-foreground">Set up your instance</p>
          </div>

          <Card className="border-border/30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-primary/5">
                <Shield className="size-5 text-primary" />
              </div>
              <CardTitle className="text-center text-lg">Create Owner Account</CardTitle>
              <CardDescription className="text-center leading-relaxed">
                This will be the first administrator account for your BookLite instance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-email" className="text-[13px]">Email</Label>
                  <Input
                    id="setup-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-username" className="text-[13px]">Username</Label>
                  <Input
                    id="setup-username"
                    type="text"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-password" className="text-[13px]">Password</Label>
                  <Input
                    id="setup-password"
                    type="password"
                    placeholder="Choose a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5 text-[13px] text-destructive animate-scale-in">
                    <span className="shrink-0 mt-px size-1.5 rounded-full bg-destructive" />
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-10" disabled={submitting}>
                  {submitting ? (
                    <span className="animate-pulse-soft">Creating account...</span>
                  ) : (
                    <>
                      <Shield className="size-4" />
                      Create Owner
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
