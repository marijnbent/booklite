import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ExternalLink, RefreshCw, Shield, Trash2 } from "lucide-react";

interface GeneratedApiToken {
  id: number;
  token: string;
  issuedAt: string;
  expiresAt: string;
  expiresInDays: number;
  label: string | null;
}

interface ApiTokenRecord {
  id: number;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const expiryOptions = [
  { value: "1", label: "1 day" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
] as const;

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const copyText = async (
  value: string,
  onSuccess: (message: string) => void,
  onError: (message: string) => void
) => {
  try {
    await navigator.clipboard.writeText(value);
    onSuccess("Copied");
  } catch {
    onError("Copy failed");
  }
};

export const AdminApiDocsPage: React.FC = () => {
  const [label, setLabel] = useState("LLM access");
  const [expiresInDays, setExpiresInDays] = useState<(typeof expiryOptions)[number]["value"]>("30");
  const [generated, setGenerated] = useState<GeneratedApiToken | null>(null);
  const [tokenCopyStatus, setTokenCopyStatus] = useState<string | null>(null);
  const [linkCopyStatus, setLinkCopyStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const baseUrl =
    typeof window === "undefined" ? "https://your-booklite-host" : window.location.origin;

  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => apiFetch<ApiTokenRecord[]>("/api/v1/admin/api-docs/tokens"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/v1/admin/api-docs/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  const tokenMutation = useMutation({
    mutationFn: () =>
      apiFetch<GeneratedApiToken>("/api/v1/admin/api-docs/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          expiresInDays: Number(expiresInDays),
        }),
      }),
    onSuccess: (data) => {
      setGenerated(data);
      setTokenCopyStatus(null);
      setLinkCopyStatus(null);
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const llmDocsUrl = generated
    ? `${baseUrl}/llm-docs?token=${generated.token}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Page heading */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Admin API</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate long-lived tokens for scripts and LLM agents.
        </p>
      </div>

      {/* Generate card */}
      <Card>
        <CardHeader>
          <CardTitle>Generate token</CardTitle>
          <CardDescription>
            Tokens expire automatically and can be revoked at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Inline form row */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="api-token-label">Label</Label>
              <Input
                id="api-token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="LLM access"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expires in</Label>
              <Select
                value={expiresInDays}
                onValueChange={(v) => setExpiresInDays(v as typeof expiresInDays)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expiryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-2 sm:w-auto"
                onClick={() => tokenMutation.mutate()}
                disabled={tokenMutation.isPending}
              >
                {tokenMutation.isPending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Shield className="size-4" />
                )}
                Generate
              </Button>
            </div>
          </div>

          {tokenMutation.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Could not generate token. Try again.
            </div>
          )}

          {/* Token output — only shown after generation */}
          {generated && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              {/* Raw token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="api-token-output" className="text-xs text-muted-foreground">
                    Token
                  </Label>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() =>
                      void copyText(generated.token, setTokenCopyStatus, setTokenCopyStatus)
                    }
                  >
                    <Copy className="size-3" />
                    {tokenCopyStatus ?? "Copy"}
                  </button>
                </div>
                <Textarea
                  id="api-token-output"
                  readOnly
                  value={generated.token}
                  className="min-h-[80px] font-mono text-xs"
                />
              </div>

              {/* LLM shareable link — the main action */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Shareable LLM link</Label>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() =>
                      llmDocsUrl
                        ? void copyText(llmDocsUrl, setLinkCopyStatus, setLinkCopyStatus)
                        : undefined
                    }
                  >
                    <Copy className="size-3" />
                    {linkCopyStatus ?? "Copy URL"}
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {llmDocsUrl}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste this URL to an LLM — it loads the full API docs with your token
                  pre-filled so the agent can make requests immediately.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issued tokens table */}
      {tokensQuery.data && tokensQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Issued tokens</CardTitle>
            <CardDescription>
              Active and revoked tokens. Revoke any token to invalidate it immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 pr-4 font-medium">Issued</th>
                  <th className="py-2 pr-4 font-medium">Expires</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {tokensQuery.data.map((t) => {
                  const isExpired = new Date(t.expiresAt).getTime() < Date.now();
                  const isRevoked = !!t.revokedAt;
                  const isActive = !isRevoked && !isExpired;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border/40 align-middle last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {t.label ?? (
                          <span className="italic text-muted-foreground">unlabeled</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDateTime(t.expiresAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            isActive
                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : isRevoked
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                        </span>
                      </td>
                      <td className="py-3">
                        {isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(t.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
