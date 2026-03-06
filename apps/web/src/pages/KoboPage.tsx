import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TabletSmartphone,
  Copy,
  RefreshCw,
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

interface KoboSettings {
  token: string;
  syncEnabled: boolean;
  twoWayProgressSync: boolean;
  markReadingThreshold: number;
  markFinishedThreshold: number;
  syncCollectionIds: number[];
}

interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
  is_system?: number;
  slug?: string | null;
}

export const KoboPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [copiedField, setCopiedField] = useState<"token" | "endpoint" | null>(null);

  const settings = useQuery({
    queryKey: ["kobo-settings"],
    queryFn: () => apiFetch<KoboSettings>("/api/v1/kobo/settings")
  });

  const collections = useQuery({
    queryKey: ["collections", "kobo"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections")
  });

  const updateMutation = useMutation({
    mutationFn: (payload: KoboSettings) =>
      apiFetch<KoboSettings>("/api/v1/kobo/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kobo-settings"] })
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      apiFetch<KoboSettings>("/api/v1/kobo/settings/token", {
        method: "PUT"
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kobo-settings"] })
  });

  const handleCopy = async (text: string, field: "token" | "endpoint") => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((current) => (current === field ? null : current));
    }, 2000);
  };

  const updateSettings = (patch: Partial<KoboSettings>) => {
    if (!settings.data) return;
    updateMutation.mutate({
      ...settings.data,
      ...patch
    });
  };

  if (settings.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
    );
  }

  const model = settings.data;
  if (!model) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-sm text-muted-foreground">Could not load Kobo settings.</p>
      </div>
    );
  }

  const apiEndpoint = `${window.location.origin}/api/kobo/${model.token}`;
  const koboConfigEndpoint = `api_endpoint=${apiEndpoint}`;
  const collectionItems = collections.data ?? [];

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kobo</h1>
        <p className="mt-2 text-[13px] text-muted-foreground/70 leading-relaxed">
          Configure your Kobo e-reader sync settings
        </p>
      </div>

      {/* Sync settings card */}
      <div className="rounded-2xl border border-border/30 bg-card shadow-sm shadow-black/[0.02] dark:shadow-black/[0.08] overflow-hidden">
        {/* Subtle gradient accent line */}
        <div className="h-[2px] bg-gradient-to-r from-primary/50 via-primary/15 to-transparent" />

        <div className="p-7 space-y-7">
          {/* Section header */}
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/8">
              <TabletSmartphone className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Sync Settings</h2>
              <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                Control how books are synced to your Kobo device
              </p>
            </div>
          </div>

          {/* Toggle rows with refined spacing */}
          <div className="space-y-0 rounded-xl border border-border/20 overflow-hidden bg-muted/[0.04]">
            {/* Enable sync */}
            <div className="flex items-center justify-between gap-4 px-5 py-4.5 bg-transparent hover:bg-muted/15 transition-colors duration-150">
              <div className="space-y-0.5">
                <Label htmlFor="sync-enabled" className="text-sm font-medium cursor-pointer">Enable sync</Label>
                <p className="text-[12px] text-muted-foreground/60">
                  Allow your Kobo device to sync with BookLite
                </p>
              </div>
              <Switch
                id="sync-enabled"
                checked={model.syncEnabled}
                onCheckedChange={(checked) => updateSettings({ syncEnabled: checked })}
              />
            </div>

            {/* Divider */}
            <div className="h-px bg-border/15 mx-5" />

            {/* Two-way sync */}
            <div className="flex items-center justify-between gap-4 px-5 py-4.5 bg-transparent hover:bg-muted/15 transition-colors duration-150">
              <div className="space-y-0.5">
                <Label htmlFor="two-way-sync" className="text-sm font-medium cursor-pointer">Two-way progress sync</Label>
                <p className="text-[12px] text-muted-foreground/60">
                  Sync reading progress both directions
                </p>
              </div>
              <Switch
                id="two-way-sync"
                checked={model.twoWayProgressSync}
                onCheckedChange={(checked) => updateSettings({ twoWayProgressSync: checked })}
              />
            </div>
          </div>

          {/* Collections to sync */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Collections to sync</Label>
                <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                  Only EPUB books from selected collections will sync to Kobo.
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {model.syncCollectionIds.length} selected
              </Badge>
            </div>

            {model.syncCollectionIds.length === 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>No collections selected. Kobo sync will not send any books.</span>
              </div>
            )}

            <div className="rounded-xl border border-border/20 overflow-hidden bg-muted/[0.04]">
              <div className="max-h-52 overflow-y-auto scrollbar-thin">
                {collectionItems.map((collection, i) => {
                  const checked = model.syncCollectionIds.includes(collection.id);
                  return (
                    <React.Fragment key={collection.id}>
                      {i > 0 && <div className="h-px bg-border/12 mx-5" />}
                      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/15 transition-colors duration-150">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{collection.name}</p>
                          {collection.slug === "favorites" && (
                            <p className="text-[11px] text-muted-foreground/50">Default favorites collection</p>
                          )}
                        </div>
                        <Switch
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            const nextIds = nextChecked
                              ? [...model.syncCollectionIds, collection.id]
                              : model.syncCollectionIds.filter((id) => id !== collection.id);
                            updateSettings({ syncCollectionIds: [...new Set(nextIds)] });
                          }}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
                {collectionItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted/30 mb-2">
                      <TabletSmartphone className="size-4 text-muted-foreground/30" />
                    </div>
                    <p className="text-xs text-muted-foreground/50">No collections available yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Threshold settings */}
          <div className="h-px bg-gradient-to-r from-border/40 via-border/20 to-transparent" />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2.5">
              <Label htmlFor="reading-threshold" className="text-sm font-medium">Mark reading at (%)</Label>
              <Input
                id="reading-threshold"
                type="number"
                min={0}
                max={100}
                value={model.markReadingThreshold}
                onChange={(e) => updateSettings({ markReadingThreshold: Number(e.target.value) })}
                className="rounded-xl tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Progress percent to auto-mark as reading
              </p>
            </div>
            <div className="space-y-2.5">
              <Label htmlFor="finished-threshold" className="text-sm font-medium">Mark finished at (%)</Label>
              <Input
                id="finished-threshold"
                type="number"
                min={0}
                max={100}
                value={model.markFinishedThreshold}
                onChange={(e) => updateSettings({ markFinishedThreshold: Number(e.target.value) })}
                className="rounded-xl tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Progress percent to auto-mark as finished
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Token card */}
      <div className="rounded-2xl border border-border/30 bg-card shadow-sm shadow-black/[0.02] dark:shadow-black/[0.08] overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-status-processing/40 via-status-processing/12 to-transparent" />

        <div className="p-7 space-y-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Kobo Token</h2>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">
              Use this token to authenticate your Kobo device
            </p>
          </div>

          {/* Token code block */}
          <div className="space-y-2.5">
            <Label htmlFor="kobo-token" className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-[0.08em]">Kobo token</Label>
            <div className="relative rounded-xl border border-border/20 bg-muted/[0.06] overflow-hidden ring-1 ring-border/[0.04]">
              <Textarea
                id="kobo-token"
                value={model.token}
                readOnly
                rows={3}
                className="font-mono text-[12.5px] leading-relaxed bg-transparent border-0 focus-visible:ring-0 resize-none text-foreground/75 px-4 py-3.5"
              />
              {/* Subtle top-right decoration */}
              <div className="pointer-events-none absolute right-4 top-3.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/20">
                TOKEN
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy(model.token, "token")}
              className="gap-1.5 rounded-xl active:scale-[0.97] transition-all duration-200"
            >
              {copiedField === "token" ? (
                <>
                  <Check className="size-3.5 text-status-completed" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy token
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              className="gap-1.5 rounded-xl active:scale-[0.97] transition-all duration-200"
            >
              <RefreshCw className={`size-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>

          <div className="h-px bg-gradient-to-r from-border/25 via-border/10 to-transparent" />

          {/* API endpoint code block */}
          <div className="space-y-2.5">
            <Label htmlFor="kobo-api-endpoint" className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-[0.08em]">API endpoint (put this in your Kobo config)</Label>
            <div className="relative rounded-xl border border-border/20 bg-muted/[0.06] overflow-hidden ring-1 ring-border/[0.04]">
              <Textarea
                id="kobo-api-endpoint"
                value={koboConfigEndpoint}
                readOnly
                rows={2}
                className="font-mono text-[12.5px] leading-relaxed bg-transparent border-0 focus-visible:ring-0 resize-none text-foreground/75 px-4 py-3.5"
              />
              <div className="pointer-events-none absolute right-4 top-3.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/20">
                ENDPOINT
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy(koboConfigEndpoint, "endpoint")}
              className="gap-1.5 rounded-xl active:scale-[0.97] transition-all duration-200"
            >
              {copiedField === "endpoint" ? (
                <>
                  <Check className="size-3.5 text-status-completed" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy endpoint
                </>
              )}
            </Button>
            <Button asChild variant="secondary" size="sm" className="gap-1.5 rounded-xl">
              <Link to="/docs#kobo-setup">
                <ExternalLink className="size-3.5" />
                Setup instructions
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
