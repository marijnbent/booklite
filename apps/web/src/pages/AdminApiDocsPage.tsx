import React, { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Copy, RefreshCw, Shield, TerminalSquare } from "lucide-react";

interface GeneratedApiToken {
  token: string;
  issuedAt: string;
  expiresAt: string;
  expiresInDays: number;
  label: string | null;
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

const SnippetCard: React.FC<{
  title: string;
  code: string;
  onCopy: () => void;
  className?: string;
}> = ({ title, code, onCopy, className }) => (
  <div className={cn("rounded-lg border border-border/60 bg-background", className)}>
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TerminalSquare className="size-4 text-muted-foreground" />
        {title}
      </div>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onCopy}>
        <Copy className="size-3.5" />
        Copy
      </Button>
    </div>
    <pre className="overflow-x-auto px-4 py-3 text-xs leading-6 text-foreground">
      <code>{code}</code>
    </pre>
  </div>
);

export const AdminApiDocsPage: React.FC = () => {
  const [label, setLabel] = useState("LLM access");
  const [expiresInDays, setExpiresInDays] = useState<(typeof expiryOptions)[number]["value"]>("30");
  const [generated, setGenerated] = useState<GeneratedApiToken | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const baseUrl =
    typeof window === "undefined" ? "https://your-booklite-host" : window.location.origin;

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
      setCopyStatus(null);
    },
  });

  const authHeaderValue = generated ? `Bearer ${generated.token}` : "Bearer $BOOKLITE_TOKEN";

  const exportSnippet = useMemo(
    () =>
      generated
        ? `export BOOKLITE_TOKEN="${generated.token}"`
        : 'export BOOKLITE_TOKEN="paste-token-here"',
    [generated]
  );

  const listBooksSnippet = useMemo(
    () => `curl -s "${baseUrl}/api/v1/books?limit=25" \\
  -H "Authorization: Bearer $BOOKLITE_TOKEN"`,
    [baseUrl]
  );

  const updateProgressSnippet = useMemo(
    () => `curl -s "${baseUrl}/api/v1/books/123" \\
  -X PATCH \\
  -H "Authorization: Bearer $BOOKLITE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "READING",
    "progressPercent": 42
  }'`,
    [baseUrl]
  );

  const collectionSnippet = useMemo(
    () => `curl -s "${baseUrl}/api/v1/collections" \\
  -H "Authorization: Bearer $BOOKLITE_TOKEN"

curl -s "${baseUrl}/api/v1/collections/12/books" \\
  -H "Authorization: Bearer $BOOKLITE_TOKEN"`,
    [baseUrl]
  );

  const llmHandoff = useMemo(
    () => `BookLite API quickstart

Base URL: ${baseUrl}
Authorization header: ${authHeaderValue}

Useful endpoints:
- GET /api/v1/books?limit=25&offset=0&q=search
- GET /api/v1/books/:id
- PATCH /api/v1/books/:id
- GET /api/v1/collections
- GET /api/v1/collections/:id/books
- POST /api/v1/books/:id/metadata/fetch
- PUT /api/v1/books/:id/favorite

Typical PATCH body for book progress:
{
  "status": "READING",
  "progressPercent": 42
}

Books and collections require Bearer auth on every request.`,
    [authHeaderValue, baseUrl]
  );

  const endpoints = [
    {
      method: "GET",
      path: "/api/v1/books",
      note: "List books. Supports q, limit, and offset.",
    },
    {
      method: "GET",
      path: "/api/v1/books/:id",
      note: "Fetch one book with progress.",
    },
    {
      method: "PATCH",
      path: "/api/v1/books/:id",
      note: "Update metadata or reading progress.",
    },
    {
      method: "GET",
      path: "/api/v1/collections",
      note: "List collections. includeVirtual=true is supported.",
    },
    {
      method: "GET",
      path: "/api/v1/collections/:id/books",
      note: "List books inside a collection.",
    },
    {
      method: "POST",
      path: "/api/v1/books/:id/metadata/fetch",
      note: "Refresh metadata for a book.",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-foreground">
          <Shield className="size-4 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin API</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Owner-only API notes for scripts and LLM agents. This page is intentionally plain and
          copy-friendly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate bearer token</CardTitle>
          <CardDescription>
            This creates a long-lived JWT for API requests. Tokens expire automatically, but they
            are not individually revocable yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <div className="space-y-2">
              <Label htmlFor="api-token-label">Label</Label>
              <Input
                id="api-token-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="LLM access"
              />
            </div>

            <div className="space-y-2">
              <Label>Expires in</Label>
              <Select value={expiresInDays} onValueChange={(value) => setExpiresInDays(value as typeof expiresInDays)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expiryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full gap-2 md:w-auto"
                onClick={() => tokenMutation.mutate()}
                disabled={tokenMutation.isPending}
              >
                {tokenMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Shield className="size-4" />}
                Generate token
              </Button>
            </div>
          </div>

          {tokenMutation.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Could not generate token. Try again.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="api-token-output">Token</Label>
              <div className="flex items-center gap-2">
                {copyStatus && <span className="text-xs text-muted-foreground">{copyStatus}</span>}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!generated}
                  onClick={() => {
                    if (!generated) return;
                    void copyText(generated.token, setCopyStatus, setCopyStatus);
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy token
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!generated}
                  onClick={() => {
                    if (!generated) return;
                    void copyText(exportSnippet, setCopyStatus, setCopyStatus);
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy export line
                </Button>
              </div>
            </div>
            <Textarea
              id="api-token-output"
              readOnly
              value={generated?.token ?? ""}
              placeholder="Generate a token to show it here."
              className="min-h-[112px] font-mono text-xs"
            />
          </div>

          {generated && (
            <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Issued</div>
                <div>{formatDateTime(generated.issuedAt)}</div>
              </div>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Expires</div>
                <div>{formatDateTime(generated.expiresAt)}</div>
              </div>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Header</div>
                <div className="truncate font-mono text-xs">{authHeaderValue}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Copyable snippets</CardTitle>
              <CardDescription>
                These examples assume the token is stored in <code>$BOOKLITE_TOKEN</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SnippetCard
                title="Shell export"
                code={exportSnippet}
                onCopy={() => void copyText(exportSnippet, setCopyStatus, setCopyStatus)}
              />
              <SnippetCard
                title="List books"
                code={listBooksSnippet}
                onCopy={() => void copyText(listBooksSnippet, setCopyStatus, setCopyStatus)}
              />
              <SnippetCard
                title="Update reading progress"
                code={updateProgressSnippet}
                onCopy={() => void copyText(updateProgressSnippet, setCopyStatus, setCopyStatus)}
              />
              <SnippetCard
                title="Collections"
                code={collectionSnippet}
                onCopy={() => void copyText(collectionSnippet, setCopyStatus, setCopyStatus)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>LLM handoff block</CardTitle>
              <CardDescription>
                Paste this into an agent or external tool as a starting point.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea readOnly value={llmHandoff} className="min-h-[260px] font-mono text-xs" />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void copyText(llmHandoff, setCopyStatus, setCopyStatus)}
                >
                  <Copy className="size-3.5" />
                  Copy handoff
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Request basics</CardTitle>
              <CardDescription>Use JSON, send Bearer auth, and keep to the API prefix.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Base URL</div>
                <div className="font-mono text-xs text-muted-foreground">{baseUrl}</div>
              </div>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Authorization header</div>
                <div className="font-mono text-xs text-muted-foreground break-all">
                  Authorization: {authHeaderValue}
                </div>
              </div>
              <div className="rounded-md border border-border/60 px-3 py-2">
                <div className="font-medium text-foreground">Content type</div>
                <div className="font-mono text-xs text-muted-foreground">
                  Content-Type: application/json
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Useful endpoints</CardTitle>
              <CardDescription>Enough to browse books, inspect collections, and update progress.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Path</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((endpoint) => (
                    <tr key={`${endpoint.method}-${endpoint.path}`} className="border-b border-border/40 align-top last:border-0">
                      <td className="py-3 pr-3 font-mono text-xs text-foreground">{endpoint.method}</td>
                      <td className="py-3 pr-3 font-mono text-xs text-foreground">{endpoint.path}</td>
                      <td className="py-3 text-muted-foreground">{endpoint.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
