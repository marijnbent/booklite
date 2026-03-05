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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/[0.04] p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-up">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 shadow-sm shadow-primary/10">
            <Book className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BookLite</h1>
          <p className="text-sm text-muted-foreground">Set up your instance</p>
        </div>

        <Card className="border-border/40 shadow-lg shadow-black/[0.03]">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="size-5 text-primary" />
            </div>
            <CardTitle className="text-center text-lg">Create Owner Account</CardTitle>
            <CardDescription className="text-center">
              This will be the first administrator account for your BookLite instance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setup-email">Email</Label>
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
                <Label htmlFor="setup-username">Username</Label>
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
                <Label htmlFor="setup-password">Password</Label>
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
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive animate-scale-in">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
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
  );
};
