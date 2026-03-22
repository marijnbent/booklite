import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, Check, Copy } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  description: string;
  params?: string;
  body?: string;
  curl: (base: string, token: string) => string;
}

interface Section {
  title: string;
  endpoints: Endpoint[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<string, string> = {
  GET: "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/60 dark:border-sky-800",
  POST: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-800",
  PATCH:
    "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:border-amber-800",
  PUT: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/60 dark:border-violet-800",
  DELETE:
    "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/60 dark:border-rose-800",
};

const SECTIONS: Section[] = [
  {
    title: "Books",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/books",
        description: "List all books. Supports search, pagination, and status filtering.",
        params: "q (search string), limit (default 25), offset, status (READING | READ | UNSET)",
        curl: (base, token) =>
          `curl -s "${base}/api/v1/books?limit=25" \\\n  -H "Authorization: Bearer ${token}"`,
      },
      {
        method: "GET",
        path: "/api/v1/books/:id",
        description: "Get a single book including reading progress.",
        curl: (base, token) =>
          `curl -s "${base}/api/v1/books/123" \\\n  -H "Authorization: Bearer ${token}"`,
      },
      {
        method: "PATCH",
        path: "/api/v1/books/:id",
        description: "Update reading progress or metadata fields.",
        body: `{ "status": "READING" | "READ" | "UNSET", "progressPercent": 0–100, "title": "...", "author": "..." }`,
        curl: (base, token) =>
          `curl -s -X PATCH "${base}/api/v1/books/123" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status":"READING","progressPercent":42}'`,
      },
      {
        method: "PUT",
        path: "/api/v1/books/:id/favorite",
        description: "Toggle favorite status on a book.",
        curl: (base, token) =>
          `curl -s -X PUT "${base}/api/v1/books/123/favorite" \\\n  -H "Authorization: Bearer ${token}"`,
      },
    ],
  },
  {
    title: "Collections",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/collections",
        description: "List all collections. Pass includeVirtual=true to include smart collections.",
        params: "includeVirtual (boolean, default false)",
        curl: (base, token) =>
          `curl -s "${base}/api/v1/collections" \\\n  -H "Authorization: Bearer ${token}"`,
      },
      {
        method: "GET",
        path: "/api/v1/collections/:id/books",
        description: "List books inside a specific collection.",
        curl: (base, token) =>
          `curl -s "${base}/api/v1/collections/12/books" \\\n  -H "Authorization: Bearer ${token}"`,
      },
    ],
  },
  {
    title: "Metadata",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/books/:id/metadata/fetch",
        description:
          "Re-fetch metadata for a book from external providers (Open Library, Google Books, etc.). The job runs asynchronously.",
        curl: (base, token) =>
          `curl -s -X POST "${base}/api/v1/books/123/metadata/fetch" \\\n  -H "Authorization: Bearer ${token}"`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Plain-text generation for "copy all" button
// ---------------------------------------------------------------------------

function buildPlainText(base: string, token: string): string {
  const tokenDisplay = token || "YOUR_TOKEN_HERE";
  const lines: string[] = [
    "BookLite API Reference",
    `Base URL: ${base}`,
    `Authorization: Bearer ${tokenDisplay}`,
    "",
    "All requests require the Authorization header shown above.",
    'For PATCH and POST requests, add: Content-Type: application/json',
    "",
    "Status values: UNSET | READING | READ",
    "",
  ];

  for (const section of SECTIONS) {
    lines.push(section.title.toUpperCase());
    for (const ep of section.endpoints) {
      lines.push(`  ${ep.method}  ${ep.path}`);
      lines.push(`  ${ep.description}`);
      if (ep.params) lines.push(`  Params: ${ep.params}`);
      if (ep.body) lines.push(`  Body: ${ep.body}`);
      lines.push(`  Example:`);
      const curlLines = ep.curl(base, tokenDisplay).split("\n");
      for (const l of curlLines) lines.push(`    ${l}`);
      lines.push("");
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const MethodBadge: React.FC<{ method: string }> = ({ method }) => (
  <span
    className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${METHOD_COLORS[method] ?? ""}`}
  >
    {method}
  </span>
);

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-green-600 dark:text-green-400" /> : <Copy className="size-3" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
};

const CodeBlock: React.FC<{ code: string }> = ({ code }) => (
  <div className="group relative mt-2 rounded-md border border-border/60 bg-muted/30">
    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
      <CopyButton text={code} />
    </div>
    <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-6 text-foreground">
      <code>{code}</code>
    </pre>
  </div>
);

const EndpointRow: React.FC<{ ep: Endpoint; base: string; token: string }> = ({
  ep,
  base,
  token,
}) => (
  <div className="border-b border-border/40 py-4 last:border-0">
    <div className="flex flex-wrap items-center gap-2">
      <MethodBadge method={ep.method} />
      <code className="font-mono text-sm text-foreground">{ep.path}</code>
    </div>
    <p className="mt-1.5 text-sm text-muted-foreground">{ep.description}</p>
    {ep.params && (
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Params:</span> {ep.params}
      </p>
    )}
    {ep.body && (
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Body:</span>{" "}
        <code className="font-mono">{ep.body}</code>
      </p>
    )}
    <CodeBlock code={ep.curl(base, token || "YOUR_TOKEN_HERE")} />
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const LlmDocsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [allCopied, setAllCopied] = useState(false);

  const base =
    typeof window === "undefined" ? "https://your-booklite-host" : window.location.origin;

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText(base, token));
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2500);
    } catch {
      // silent
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="size-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">BookLite</div>
              <div className="text-xs text-muted-foreground leading-tight">API Reference</div>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void handleCopyAll()}
          >
            {allCopied ? (
              <Check className="size-3.5 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {allCopied ? "Copied!" : "Copy all as text"}
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Auth box */}
        <div className="rounded-lg border border-border/60 bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Authentication
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Base URL */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Base URL</div>
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-foreground">{base}</code>
                <CopyButton text={base} />
              </div>
            </div>

            {/* Token */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Bearer token</div>
              {token ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-xs text-foreground">
                    {token.slice(0, 24)}…
                  </code>
                  <CopyButton text={token} />
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/40">
                  <span className="flex-1 text-xs text-amber-700 dark:text-amber-400">
                    No token — add ?token=YOUR_TOKEN to the URL
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Authorization header */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Authorization header</div>
            <div className="group relative rounded-md border border-border/60 bg-muted/30">
              <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButton
                  text={`Authorization: Bearer ${token || "YOUR_TOKEN_HERE"}`}
                />
              </div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-6 text-foreground">
                <code>{`Authorization: Bearer ${token || "YOUR_TOKEN_HERE"}`}</code>
              </pre>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Send this header on every request. For PATCH and POST requests also send{" "}
            <code className="font-mono">Content-Type: application/json</code>.
          </p>
        </div>

        {/* Endpoint sections */}
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {section.title}
            </h2>
            <div className="rounded-lg border border-border/60 bg-card px-5">
              {section.endpoints.map((ep) => (
                <EndpointRow
                  key={`${ep.method}-${ep.path}`}
                  ep={ep}
                  base={base}
                  token={token}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Notes */}
        <div className="rounded-lg border border-border/60 bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Notes
          </h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              Book <strong className="font-medium text-foreground">status</strong> values:{" "}
              <code className="font-mono text-xs">UNSET</code>,{" "}
              <code className="font-mono text-xs">READING</code>,{" "}
              <code className="font-mono text-xs">READ</code>
            </li>
            <li>
              <strong className="font-medium text-foreground">progressPercent</strong> is an integer
              from 0 to 100.
            </li>
            <li>
              Metadata fetch jobs run <strong className="font-medium text-foreground">asynchronously</strong> — poll
              the book endpoint to see when fields are updated.
            </li>
            <li>
              All list endpoints return a JSON array. Pagination is controlled with{" "}
              <code className="font-mono text-xs">limit</code> and{" "}
              <code className="font-mono text-xs">offset</code>.
            </li>
          </ul>
        </div>

        <p className="pb-8 text-center text-xs text-muted-foreground/60">
          BookLite &mdash; self-hosted ebook library
        </p>
      </main>
    </div>
  );
};
