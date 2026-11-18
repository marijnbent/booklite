import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SIGNED_OUT_KEY, useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BookLiteLogo } from "@/components/BookLiteLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const SSO_START_URL = "/api/v1/auth/oidc/start";
const SSO_HASH_PREFIX = "#sso=";
const SSO_ERROR = "Single sign-on failed. Try again or sign in with your password.";

export const LoginPage: React.FC = () => {
  const { login, completeSso } = useAuth();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [sso, setSso] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const { hash, search } = window.location;
    if (hash.startsWith(SSO_HASH_PREFIX)) {
      window.history.replaceState(null, "", "/login");
      completeSso(hash.slice(SSO_HASH_PREFIX.length))
        .then(() => navigate("/library", { replace: true }))
        .catch(() => {
          setSso(true);
          setError(SSO_ERROR);
          setStatusLoading(false);
        });
      return;
    }

    const params = new URLSearchParams(search);
    const stayHere = params.has("local") || params.has("error") || sessionStorage.getItem(SIGNED_OUT_KEY) !== null;
    if (params.has("error")) setError(SSO_ERROR);

    apiFetch<{ completed: boolean; sso: boolean }>("/api/v1/setup/status")
      .then((result) => {
        if (!result.completed) {
          navigate("/setup", { replace: true });
        } else if (result.sso && !stayHere) {
          window.location.replace(SSO_START_URL);
          return;
        }
        setSso(result.sso);
        setStatusLoading(false);
      })
      .catch(() => setStatusLoading(false));
  }, [navigate, completeSso]);

  if (statusLoading) {
    return (
      <div className="flex auth-page min-h-screen items-center justify-center bg-transparent">
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
    <div className="flex auth-page min-h-screen items-center justify-center bg-transparent px-4">
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-4">
          <BookLiteLogo className="size-8" decorative />
          <span className="text-2xl font-semibold tracking-tight">BookLite</span>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card shadow-lg shadow-black/[0.04]">
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

              {sso && (
                <Button asChild variant="outline" className="w-full">
                  <a href={SSO_START_URL}>Use single sign-on</a>
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
