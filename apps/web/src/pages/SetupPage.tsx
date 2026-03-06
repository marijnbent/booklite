import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book, Loader2 } from "lucide-react";

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
        <Loader2 className="size-5 text-muted-foreground animate-spin" />
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Book className="size-5" strokeWidth={1.5} />
          <span className="text-sm font-medium tracking-wide">BookLite</span>
        </div>

        {/* Form card */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          {/* Thin accent line at top */}
          <div className="h-px bg-primary/40" />

          <div className="p-6">
            <h1 className="text-xl font-semibold tracking-tight text-center mb-1">
              Create Owner Account
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Set up the first administrator for your instance
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="setup-email" className="text-[13px]">
                  Email
                </Label>
                <Input
                  id="setup-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="setup-username" className="text-[13px]">
                  Username
                </Label>
                <Input
                  id="setup-username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="setup-password" className="text-[13px]">
                  Password
                </Label>
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
                <p className="text-[13px] text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create Owner"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
