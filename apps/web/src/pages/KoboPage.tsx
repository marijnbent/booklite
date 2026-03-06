import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
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
    <div className="space-y-8 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kobo</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Configure your Kobo e-reader sync settings
        </p>
      </div>

      {/* Sync settings */}
      <Card>
        <CardContent className="pt-5 space-y-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Sync Settings</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control how books are synced to your Kobo device
            </p>
          </div>

          {/* Toggle rows */}
          <div className="border border-border/50 rounded-md divide-y divide-border/50">
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div>
                <Label htmlFor="sync-enabled" className="text-sm font-medium cursor-pointer">Enable sync</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow your Kobo device to sync with BookLite
                </p>
              </div>
              <Switch
                id="sync-enabled"
                checked={model.syncEnabled}
                onCheckedChange={(checked) => updateSettings({ syncEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div>
                <Label htmlFor="two-way-sync" className="text-sm font-medium cursor-pointer">Two-way progress sync</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only EPUB books from selected collections will sync to Kobo.
                </p>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {model.syncCollectionIds.length} selected
              </Badge>
            </div>

            {model.syncCollectionIds.length === 0 && (
              <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>No collections selected. Kobo sync will not send any books.</span>
              </div>
            )}

            <div className="border border-border/50 rounded-md divide-y divide-border/50">
              <div className="max-h-52 overflow-y-auto">
                {collectionItems.map((collection) => {
                  const checked = model.syncCollectionIds.includes(collection.id);
                  return (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/50 transition-colors duration-150"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{collection.name}</p>
                        {collection.slug === "favorites" && (
                          <p className="text-xs text-muted-foreground">Default favorites collection</p>
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
                  );
                })}
                {collectionItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-xs text-muted-foreground">No collections available yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Threshold settings */}
          <div className="border-t border-border/50 pt-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reading-threshold" className="text-sm font-medium">Mark reading at (%)</Label>
                <Input
                  id="reading-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={model.markReadingThreshold}
                  onChange={(e) => updateSettings({ markReadingThreshold: Number(e.target.value) })}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Progress percent to auto-mark as reading
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finished-threshold" className="text-sm font-medium">Mark finished at (%)</Label>
                <Input
                  id="finished-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={model.markFinishedThreshold}
                  onChange={(e) => updateSettings({ markFinishedThreshold: Number(e.target.value) })}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Progress percent to auto-mark as finished
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token & endpoint */}
      <Card>
        <CardContent className="pt-5 space-y-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Kobo Token</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Use this token to authenticate your Kobo device
            </p>
          </div>

          {/* Token */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Token</Label>
            <div className="rounded-md border border-border/50 bg-muted/30 px-3.5 py-3">
              <code className="font-mono text-xs leading-relaxed text-foreground/80 break-all select-all">
                {model.token}
              </code>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy(model.token, "token")}
              className="gap-1.5"
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
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>

          {/* API endpoint */}
          <div className="border-t border-border/50 pt-6 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">API endpoint (put this in your Kobo config)</Label>
            <div className="rounded-md border border-border/50 bg-muted/30 px-3.5 py-3">
              <code className="font-mono text-xs leading-relaxed text-foreground/80 break-all select-all">
                {koboConfigEndpoint}
              </code>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy(koboConfigEndpoint, "endpoint")}
              className="gap-1.5"
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
            <Button asChild variant="secondary" size="sm" className="gap-1.5">
              <Link to="/docs#kobo-setup">
                <ExternalLink className="size-3.5" />
                Setup instructions
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
