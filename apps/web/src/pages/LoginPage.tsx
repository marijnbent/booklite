import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, Loader2, LogIn } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ completed: boolean }>("/api/v1/setup/status")
      .then((result) => {
        if (!result.completed) {
          navigate("/setup", { replace: true });
        }
      })
      .catch(() => undefined)
      .finally(() => setStatusLoading(false));
  }, [navigate]);

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
    setLoading(true);
    try {
      await login(usernameOrEmail, password);
      navigate("/library");
    } catch {
      setError("Login failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/[0.04] p-4">
      {/* Subtle decorative element */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 shadow-sm shadow-primary/10">
            <Book className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BookLite</h1>
          <p className="text-sm text-muted-foreground">Your personal book library</p>
        </div>

        <Card className="border-border/40 shadow-lg shadow-black/[0.03]">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Welcome back</CardTitle>
            <CardDescription className="text-center">
              Sign in to access your library
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-user">Username or email</Label>
                <Input
                  id="login-user"
                  type="text"
                  placeholder="john@example.com"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-pass">Password</Label>
                <Input
                  id="login-pass"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive animate-scale-in">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="animate-pulse-soft">Signing in...</span>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    Sign in
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
