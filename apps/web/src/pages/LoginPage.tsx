import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book, Loader2 } from "lucide-react";

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
        <Loader2 className="size-5 text-muted-foreground animate-spin" />
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Subtle decorative gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 size-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 size-[500px] rounded-full bg-primary/4 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 ring-2 ring-primary/20 shadow-sm">
            <Book className="size-6 text-primary" />
          </div>
          <span className="text-2xl font-bold tracking-tight">BookLite</span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card shadow-lg shadow-black/[0.04]">
          <div className="p-6">
            <h1 className="text-xl font-semibold tracking-tight text-center mb-1">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Sign in to your library
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-user" className="text-[13px]">
                  Username or email
                </Label>
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

              <div className="space-y-1.5">
                <Label htmlFor="login-pass" className="text-[13px]">
                  Password
                </Label>
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
                <p className="text-[13px] text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
