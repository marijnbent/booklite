import React, { useState } from "react";
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kobo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your Kobo e-reader sync settings
        </p>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
              <TabletSmartphone className="size-3.5 text-primary" />
            </div>
            Sync Settings
          </CardTitle>
          <CardDescription>
            Control how books are synced to your Kobo device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sync-enabled" className="text-sm font-medium">Enable sync</Label>
              <p className="text-xs text-muted-foreground">
                Allow your Kobo device to sync with BookLite
              </p>
            </div>
            <Switch
              id="sync-enabled"
              checked={model.syncEnabled}
              onCheckedChange={(checked) => updateSettings({ syncEnabled: checked })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="two-way-sync" className="text-sm font-medium">Two-way progress sync</Label>
              <p className="text-xs text-muted-foreground">
                Sync reading progress both directions
              </p>
            </div>
            <Switch
              id="two-way-sync"
              checked={model.twoWayProgressSync}
              onCheckedChange={(checked) => updateSettings({ twoWayProgressSync: checked })}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Collections to sync</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only EPUB books from selected collections will sync to Kobo.
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {model.syncCollectionIds.length} selected
              </Badge>
            </div>

            {model.syncCollectionIds.length === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>No collections selected. Kobo sync will not send any books.</span>
              </div>
            )}

            <div className="space-y-2 max-h-44 overflow-y-auto rounded-lg border border-border/50 p-3 bg-muted/10">
              {collectionItems.map((collection) => {
                const checked = model.syncCollectionIds.includes(collection.id);
                return (
                  <div key={collection.id} className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{collection.name}</p>
                      {collection.slug === "favorites" && (
                        <p className="text-[11px] text-muted-foreground">Default favorites collection</p>
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
                <p className="text-xs text-muted-foreground">No collections available yet.</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reading-threshold">Mark reading at (%)</Label>
              <Input
                id="reading-threshold"
                type="number"
                min={0}
                max={100}
                value={model.markReadingThreshold}
                onChange={(e) => updateSettings({ markReadingThreshold: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Progress percent to auto-mark as reading
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finished-threshold">Mark finished at (%)</Label>
              <Input
                id="finished-threshold"
                type="number"
                min={0}
                max={100}
                value={model.markFinishedThreshold}
                onChange={(e) => updateSettings({ markFinishedThreshold: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Progress percent to auto-mark as finished
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base">Kobo Token</CardTitle>
          <CardDescription>
            Use this token to authenticate your Kobo device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kobo-token">Kobo token</Label>
            <Textarea
              id="kobo-token"
              value={model.token}
              readOnly
              rows={3}
              className="font-mono text-xs bg-muted/30"
            />
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

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="kobo-api-endpoint">API endpoint (put this in your Kobo config)</Label>
            <Textarea
              id="kobo-api-endpoint"
              value={koboConfigEndpoint}
              readOnly
              rows={2}
              className="font-mono text-xs bg-muted/30"
            />
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
              <a
                href="https://booklore.org/docs/integration/kobo#step-2-configure-your-kobo"
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink className="size-3.5" />
                Setup instructions
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
