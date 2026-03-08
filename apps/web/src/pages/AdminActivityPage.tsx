import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TerminalSquare,
  RefreshCw,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Info,
  Inbox,
} from "lucide-react";

type AdminActivityScope = "metadata" | "upload" | "kobo";
type AdminActivityLevel = "ERROR" | "WARN" | "INFO";

interface AdminActivityItem {
  id: number;
  scope: AdminActivityScope;
  event: string;
  level: AdminActivityLevel;
  message: string;
  details: unknown;
  actorUserId: number | null;
  targetUserId: number | null;
  bookId: number | null;
  jobId: string | null;
  createdAt: string;
}

interface AppSettings {
  koboDebugLogging: boolean;
}

const activityScopeOptions: Array<{ value: "all" | AdminActivityScope; label: string }> = [
  { value: "all", label: "All systems" },
  { value: "metadata", label: "Metadata" },
  { value: "upload", label: "Upload" },
  { value: "kobo", label: "Kobo" },
];

const activityLevelOptions: Array<{ value: "all" | AdminActivityLevel; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "ERROR", label: "Errors" },
  { value: "WARN", label: "Warnings" },
  { value: "INFO", label: "Info / Debug" },
];

const activityScopeMeta: Record<AdminActivityScope, { label: string; className: string }> = {
  metadata: {
    label: "Metadata",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  upload: {
    label: "Upload",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  kobo: {
    label: "Kobo",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

const activityLevelClassName: Record<AdminActivityLevel, string> = {
  ERROR: "bg-destructive/10 text-destructive",
  WARN: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  INFO: "bg-muted text-muted-foreground",
};

// Level icon map for structured log rows
const levelIcon: Record<AdminActivityLevel, React.ReactNode> = {
  ERROR: <AlertCircle className="size-3.5 shrink-0 text-destructive" />,
  WARN: <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />,
  INFO: <Info className="size-3.5 shrink-0 text-muted-foreground" />,
};

const formatActivityTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatActivityDetails = (details: unknown): string =>
  JSON.stringify(details, null, 2) ?? "";

const formatActivityLine = (entry: AdminActivityItem): string => {
  const context = [
    entry.actorUserId !== null ? `actor=${entry.actorUserId}` : null,
    entry.targetUserId !== null ? `target=${entry.targetUserId}` : null,
    entry.bookId !== null ? `book=${entry.bookId}` : null,
    entry.jobId ? `job=${entry.jobId}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const header = [
    `[${formatActivityTime(entry.createdAt)}]`,
    `[${entry.level}]`,
    `[${entry.scope}]`,
    entry.event,
    context,
  ]
    .filter(Boolean)
    .join(" ");

  if (entry.details === null || entry.details === undefined) {
    return `${header}\n${entry.message}`;
  }

  return `${header}\n${entry.message}\n${formatActivityDetails(entry.details)}`;
};

// Context tags shown inline in each log row
const EntryContextTags: React.FC<{ entry: AdminActivityItem }> = ({ entry }) => {
  const tags = [
    entry.actorUserId !== null ? `actor ${entry.actorUserId}` : null,
    entry.targetUserId !== null ? `target ${entry.targetUserId}` : null,
    entry.bookId !== null ? `book ${entry.bookId}` : null,
    entry.jobId ? `job ${entry.jobId.slice(0, 8)}` : null,
  ].filter(Boolean) as string[];

  if (tags.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </span>
  );
};

// Individual log entry row with collapsible details
const LogEntryRow: React.FC<{ entry: AdminActivityItem; index: number }> = ({
  entry,
  index,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    entry.details !== null && entry.details !== undefined;

  return (
    <div
      className="group border-b border-border last:border-0 animate-fade-in"
      style={{ animationDelay: `${Math.min(index * 15, 300)}ms`, animationFillMode: "both" }}
    >
      {/* Main row */}
      <div
        className={[
          "flex items-start gap-3 px-4 py-3 transition-colors",
          hasDetails
            ? "cursor-pointer hover:bg-muted/40"
            : "hover:bg-muted/20",
        ].join(" ")}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        role={hasDetails ? "button" : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        onKeyDown={(e) => {
          if (hasDetails && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {/* Expand chevron / level icon */}
        <span className="mt-0.5 shrink-0">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )
          ) : (
            levelIcon[entry.level]
          )}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Top line: scope pill + level badge + event name + context tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              className={[
                "h-4 rounded-sm px-1.5 text-[10px] font-semibold uppercase tracking-wide",
                activityScopeMeta[entry.scope].className,
              ].join(" ")}
            >
              {entry.scope}
            </Badge>
            <Badge
              className={[
                "h-4 rounded-sm px-1.5 text-[10px] font-semibold uppercase tracking-wide",
                activityLevelClassName[entry.level],
              ].join(" ")}
            >
              {entry.level}
            </Badge>
            <span className="font-mono text-xs font-medium text-foreground">
              {entry.event}
            </span>
            <EntryContextTags entry={entry} />
          </div>

          {/* Message */}
          <p className="text-xs leading-relaxed text-muted-foreground">{entry.message}</p>
        </div>

        {/* Timestamp — right-aligned, shrinks gracefully */}
        <span className="ml-2 shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
          {formatActivityTime(entry.createdAt)}
        </span>
      </div>

      {/* Collapsible details panel */}
      {hasDetails && expanded && (
        <div className="border-t border-border bg-zinc-950/[0.03] px-4 pb-3 pt-2 dark:bg-zinc-50/[0.03]">
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
            {formatActivityDetails(entry.details)}
          </pre>
        </div>
      )}
    </div>
  );
};

export const AdminActivityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activityScope, setActivityScope] = useState<"all" | AdminActivityScope>("all");
  const [activityLevel, setActivityLevel] = useState<"all" | AdminActivityLevel>("all");
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => apiFetch<AppSettings>("/api/v1/app-settings"),
  });

  const activity = useQuery({
    queryKey: ["admin-activity", activityScope, activityLevel],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "250" });
      if (activityScope !== "all") params.set("scope", activityScope);
      if (activityLevel !== "all") params.set("level", activityLevel);
      return apiFetch<AdminActivityItem[]>(`/api/v1/admin/activity-log?${params.toString()}`);
    },
  });

  const clearActivity = useMutation({
    mutationFn: (scope: AdminActivityScope | "all") =>
      apiFetch<{ ok: true; cleared: number }>("/api/v1/admin/activity-log", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scope === "all" ? {} : { scope }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-activity"] }),
  });

  const activityText = (activity.data ?? [])
    .map((entry) => formatActivityLine(entry))
    .join("\n\n------------------------------\n\n");

  const copyVisibleLogs = async () => {
    try {
      await navigator.clipboard.writeText(activityText);
      setCopyState("done");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  // Compute stat counts for the header pills
  const statCounts = (activity.data ?? []).reduce(
    (acc, entry) => {
      acc[entry.level] = (acc[entry.level] ?? 0) + 1;
      return acc;
    },
    {} as Record<AdminActivityLevel, number>,
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <TerminalSquare className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            {settings.data?.koboDebugLogging ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                Kobo debug on
              </Badge>
            ) : (
              <Badge variant="secondary">Kobo debug off</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Owner-visible operational logs for metadata, uploads, and Kobo device flows.
          </p>

          {/* Stat pills — only shown when there is data */}
          {activity.data && activity.data.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {(statCounts.ERROR ?? 0) > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/8 px-2.5 py-0.5 text-xs font-medium text-destructive">
                  <AlertCircle className="size-3" />
                  {statCounts.ERROR} {statCounts.ERROR === 1 ? "error" : "errors"}
                </span>
              )}
              {(statCounts.WARN ?? 0) > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/8 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3" />
                  {statCounts.WARN} {statCounts.WARN === 1 ? "warning" : "warnings"}
                </span>
              )}
              {(statCounts.INFO ?? 0) > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <Info className="size-3" />
                  {statCounts.INFO} info
                </span>
              )}
            </div>
          )}
        </div>

        <Button variant="outline" asChild className="shrink-0 self-start">
          <Link to="/admin-users">Open settings</Link>
        </Button>
      </div>

      {/* Log stream card */}
      <Card className="rounded-lg border-border overflow-hidden">
        {/* Toolbar */}
        <CardHeader className="border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: title + count */}
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">Log stream</h2>
              {activity.data && (
                <Badge
                  variant="secondary"
                  className="h-5 rounded-full px-2 text-[11px] tabular-nums"
                >
                  {activity.data.length}
                </Badge>
              )}
            </div>

            {/* Right: filters + actions — visually separated */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter group */}
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background p-0.5">
                <Select
                  value={activityScope}
                  onValueChange={(value) =>
                    setActivityScope(value as "all" | AdminActivityScope)
                  }
                >
                  <SelectTrigger className="h-7 border-0 bg-transparent px-2.5 text-xs shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activityScopeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="h-4 w-px bg-border" />

                <Select
                  value={activityLevel}
                  onValueChange={(value) =>
                    setActivityLevel(value as "all" | AdminActivityLevel)
                  }
                >
                  <SelectTrigger className="h-7 border-0 bg-transparent px-2.5 text-xs shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activityLevelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Action group */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => activity.refetch()}
                  disabled={activity.isFetching}
                >
                  <RefreshCw
                    className={[
                      "size-3.5",
                      activity.isFetching ? "animate-spin" : "",
                    ].join(" ")}
                  />
                  Refresh
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/8 hover:text-destructive"
                  onClick={() => clearActivity.mutate(activityScope)}
                  disabled={clearActivity.isPending || !activity.data?.length}
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => void copyVisibleLogs()}
                  disabled={!activity.data?.length}
                >
                  <Copy className="size-3.5" />
                  {copyState === "done"
                    ? "Copied"
                    : copyState === "failed"
                      ? "Failed"
                      : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {activity.isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <RefreshCw className="size-5 animate-spin text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Loading activity...</p>
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Inbox className="size-10 text-muted-foreground/25" />
              <div>
                <p className="text-sm font-medium text-foreground">No log entries</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Widen the filters, or reproduce the Kobo action to capture a trace.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Structured log rows */}
              <div className="divide-y-0">
                {(activity.data ?? []).map((entry, i) => (
                  <LogEntryRow key={entry.id} entry={entry} index={i} />
                ))}
              </div>

              {/* Hidden textarea kept for clipboard copy — not visible to users */}
              <textarea
                readOnly
                aria-hidden="true"
                value={activityText}
                tabIndex={-1}
                className="sr-only"
                spellCheck={false}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
