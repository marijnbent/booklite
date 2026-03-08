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
import { TerminalSquare, RefreshCw, Trash2, Copy } from "lucide-react";

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

const activityScopeMeta: Record<
  AdminActivityScope,
  { label: string; className: string }
> = {
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

const formatActivityTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatActivityDetails = (details: unknown): string => JSON.stringify(details, null, 2) ?? "";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
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
          <p className="mt-1.5 text-sm text-muted-foreground">
            Owner-visible operational logs for metadata, uploads, and Kobo device flows.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link to="/admin-users">Open settings</Link>
        </Button>
      </div>

      <Card className="rounded-lg border-border overflow-hidden">
        <CardHeader className="pb-4 pt-5 px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold tracking-tight">Log stream</h2>
                {activity.data && (
                  <Badge variant="secondary" className="text-[11px] tabular-nums">
                    {activity.data.length}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                When Kobo debug is enabled, this includes request, response, and route-level traces.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={activityScope}
                onValueChange={(value) => setActivityScope(value as "all" | AdminActivityScope)}
              >
                <SelectTrigger className="h-8 w-[10rem] text-xs">
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

              <Select
                value={activityLevel}
                onValueChange={(value) => setActivityLevel(value as "all" | AdminActivityLevel)}
              >
                <SelectTrigger className="h-8 w-[10rem] text-xs">
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

              <Button
                size="sm"
                variant="outline"
                onClick={() => activity.refetch()}
                disabled={activity.isFetching}
              >
                <RefreshCw className={activity.isFetching ? "size-4 animate-spin" : "size-4"} />
                Refresh
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => clearActivity.mutate(activityScope)}
                disabled={clearActivity.isPending || !activity.data?.length}
              >
                <Trash2 className="size-4" />
                Clear scope
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyVisibleLogs()}
                disabled={!activity.data?.length}
              >
                <Copy className="size-4" />
                {copyState === "done"
                  ? "Copied"
                  : copyState === "failed"
                    ? "Copy failed"
                    : "Copy visible"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-6">
          {activity.isLoading ? (
            <div className="rounded-md border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              Loading activity...
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Try widening the filters or reproduce the Kobo action again.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge className={activityScope === "all" ? "bg-muted text-muted-foreground" : activityScopeMeta[activityScope].className}>
                  {activityScope === "all" ? "All scopes" : activityScopeMeta[activityScope].label}
                </Badge>
                <Badge className={activityLevel === "all" ? "bg-muted text-muted-foreground" : activityLevelClassName[activityLevel]}>
                  {activityLevel === "all" ? "All levels" : activityLevel}
                </Badge>
                <span>{activity.data?.length ?? 0} entries</span>
              </div>

              <textarea
                readOnly
                value={activityText}
                className="min-h-[36rem] w-full resize-y rounded-lg border border-border bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none"
                spellCheck={false}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
