import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UserPlus,
  Users,
  Loader2,
  Library,
  ShoppingCart,
  BookOpen,
  BookMarked,
  Star,
  Globe,
  Sparkles,
  Upload,
  Key,
  Languages,
  Cookie,
  MapPin,
  Brain,
  ChevronDown,
  ChevronUp,
  Shield,
  HardDrive,
  Info,
  Link2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  TerminalSquare,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types & constants (unchanged)
// ---------------------------------------------------------------------------

interface UserItem {
  id: number;
  email: string;
  username: string;
  role: "OWNER" | "MEMBER";
  disabledAt: string | null;
  createdAt: string;
}

interface AppSettings {
  metadataProviderEnabled: MetadataProviderEnabled;
  metadataAmazonDomain: AmazonDomain;
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  metadataOpenrouterApiKey: string;
  metadataOpenrouterModel: string;
  metadataOpenrouterEnabled: boolean;
  uploadLimitMb: number;
  ebookDownloadUrl: string;
}

type AdminActivityScope = "metadata" | "upload" | "kobo";

interface AdminActivityItem {
  id: number;
  scope: AdminActivityScope;
  event: string;
  level: "ERROR" | "WARN" | "INFO";
  message: string;
  details: unknown;
  actorUserId: number | null;
  targetUserId: number | null;
  bookId: number | null;
  jobId: string | null;
  createdAt: string;
}

type EnabledMetadataProvider =
  | "open_library"
  | "amazon"
  | "google"
  | "hardcover"
  | "goodreads"
  | "douban";

type MetadataProviderEnabled = Record<EnabledMetadataProvider, boolean>;

type AmazonDomain = "com" | "co.uk" | "de" | "fr" | "es" | "it" | "nl" | "ca" | "com.au";

const amazonDomainOptions: Array<{ value: AmazonDomain; label: string }> = [
  { value: "com", label: "amazon.com" },
  { value: "co.uk", label: "amazon.co.uk" },
  { value: "de", label: "amazon.de" },
  { value: "fr", label: "amazon.fr" },
  { value: "es", label: "amazon.es" },
  { value: "it", label: "amazon.it" },
  { value: "nl", label: "amazon.nl" },
  { value: "ca", label: "amazon.ca" },
  { value: "com.au", label: "amazon.com.au" },
];

const activityScopeOptions: Array<{ value: "all" | AdminActivityScope; label: string }> = [
  { value: "all", label: "All systems" },
  { value: "metadata", label: "Metadata" },
  { value: "upload", label: "Upload" },
  { value: "kobo", label: "Kobo" },
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

const activityLevelClassName: Record<string, string> = {
  ERROR: "bg-destructive/10 text-destructive",
  WARN: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  INFO: "bg-muted text-muted-foreground",
};

const formatActivityTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatActivityDetails = (details: unknown): string => JSON.stringify(details, null, 2);

// Provider metadata for richer display
const providerMeta: Record<
  EnabledMetadataProvider,
  { label: string; description: string; icon: React.ReactNode; color: string }
> = {
  open_library: {
    label: "Open Library",
    description: "Free, community-driven book catalog with millions of entries",
    icon: <Library className="size-4" />,
    color: "text-blue-600 dark:text-blue-400",
  },
  amazon: {
    label: "Amazon",
    description: "Scrapes book details from Amazon product pages",
    icon: <ShoppingCart className="size-4" />,
    color: "text-amber-600 dark:text-amber-400",
  },
  google: {
    label: "Google Books",
    description: "Google's book database with broad international coverage",
    icon: <BookOpen className="size-4" />,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  hardcover: {
    label: "Hardcover",
    description: "Modern book tracking platform with curated metadata",
    icon: <BookMarked className="size-4" />,
    color: "text-purple-600 dark:text-purple-400",
  },
  goodreads: {
    label: "Goodreads",
    description: "The world's largest site for readers and book recommendations",
    icon: <Star className="size-4" />,
    color: "text-orange-600 dark:text-orange-400",
  },
  douban: {
    label: "Douban",
    description: "Chinese social network with extensive book metadata in CJK languages",
    icon: <Globe className="size-4" />,
    color: "text-green-600 dark:text-green-400",
  },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Set<EnabledMetadataProvider>>(
    new Set()
  );
  const [activityScope, setActivityScope] = useState<"all" | AdminActivityScope>("all");

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserItem[]>("/api/v1/users"),
  });

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => apiFetch<AppSettings>("/api/v1/app-settings"),
  });

  const activity = useQuery({
    queryKey: ["admin-activity", activityScope],
    queryFn: () =>
      apiFetch<AdminActivityItem[]>(
        `/api/v1/admin/activity-log?limit=100${activityScope === "all" ? "" : `&scope=${activityScope}`}`
      ),
  });

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch<UserItem>("/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username, password, role }),
      }),
    onSuccess: () => {
      setEmail("");
      setUsername("");
      setPassword("");
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiFetch(`/api/v1/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const patchSettings = useMutation({
    mutationFn: (payload: Partial<AppSettings>) =>
      apiFetch("/api/v1/app-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-settings"] }),
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

  const updateProviderEnabled = (
    provider: EnabledMetadataProvider,
    enabled: boolean
  ): void => {
    if (!settings.data) return;
    patchSettings.mutate({
      metadataProviderEnabled: {
        ...settings.data.metadataProviderEnabled,
        [provider]: enabled,
      },
    });
  };

  const toggleProviderExpanded = (provider: EnabledMetadataProvider) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  // Providers that have expandable settings
  const providerHasSettings = (key: EnabledMetadataProvider): boolean =>
    key === "amazon" || key === "google" || key === "hardcover";

  const enabledCount = settings.data
    ? Object.values(settings.data.metadataProviderEnabled).filter(Boolean).length
    : 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-10">
        {/* ================================================================
            PAGE HEADER
            ================================================================ */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage users, metadata providers, and system configuration.
          </p>
        </div>

        {/* ================================================================
            USERS SECTION
            ================================================================ */}
        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold tracking-tight">Users</h2>
                {users.data && (
                  <Badge variant="secondary" className="text-[11px] tabular-nums">
                    {users.data.length}
                  </Badge>
                )}
              </div>
              <Button
                onClick={() => setShowCreateForm(!showCreateForm)}
                size="sm"
                variant={showCreateForm ? "secondary" : "default"}
              >
                {showCreateForm ? (
                  <>
                    <ChevronUp className="size-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Create User
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage who has access to your BookLite instance.
            </p>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-6">
            {/* Create user form (collapsible) */}
            {showCreateForm && (
              <div className="rounded-md border border-border bg-muted/30 p-5">
                <p className="text-sm font-semibold mb-4">New User</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createUser.mutate();
                  }}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Username</Label>
                    <Input
                      type="text"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Password</Label>
                    <Input
                      type="password"
                      placeholder="Strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <Select
                      value={role}
                      onValueChange={(v) => setRole(v as "OWNER" | "MEMBER")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="OWNER">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" />
                          Create User
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Users table */}
            {users.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : (users.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="size-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No users yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Create your first user to get started.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-medium text-muted-foreground">
                        User
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">
                        Role
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(users.data ?? []).map((user) => (
                      <TableRow
                        key={user.id}
                        className="hover:bg-muted/20"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                              {user.username.slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{user.username}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role}
                            onValueChange={(v) =>
                              patchUser.mutate({ id: user.id, payload: { role: v } })
                            }
                          >
                            <SelectTrigger className="h-7 w-[6.5rem] text-xs">
                              <div className="flex items-center gap-1.5">
                                <Shield className="size-3 text-muted-foreground" />
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OWNER">Owner</SelectItem>
                              <SelectItem value="MEMBER">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {user.disabledAt ? (
                            <Badge variant="destructive" className="text-[11px]">
                              Disabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] bg-status-completed/10 text-status-completed">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={user.disabledAt ? "outline" : "secondary"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              patchUser.mutate({
                                id: user.id,
                                payload: { disabled: !user.disabledAt },
                              })
                            }
                          >
                            {user.disabledAt ? "Enable" : "Disable"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================
            METADATA PROVIDERS SECTION
            ================================================================ */}
        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">Metadata Providers</h2>
              {settings.data && (
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {enabledCount} active
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              BookLite fetches book data from multiple sources and merges the best result for each field.
            </p>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="divide-y divide-border">
                {(Object.keys(providerMeta) as EnabledMetadataProvider[]).map(
                  (key) => {
                    const meta = providerMeta[key];
                    const enabled = settings.data.metadataProviderEnabled[key];
                    const hasSettings = providerHasSettings(key);

                    return (
                      <div key={key}>
                        {/* Provider row */}
                        <div className="flex items-center gap-3 py-3.5">
                          <span className={enabled ? meta.color : "text-muted-foreground/40"}>
                            {meta.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className={`text-sm font-medium ${
                                enabled ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {meta.label}
                            </span>
                            <p className="text-xs text-muted-foreground hidden sm:block">
                              {meta.description}
                            </p>
                          </div>

                          {/* Settings toggle (only if has settings and enabled) */}
                          {hasSettings && enabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground"
                              onClick={() => toggleProviderExpanded(key)}
                            >
                              Settings
                              {expandedProviders.has(key) ? (
                                <ChevronUp className="size-3 ml-1" />
                              ) : (
                                <ChevronDown className="size-3 ml-1" />
                              )}
                            </Button>
                          )}

                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              updateProviderEnabled(key, Boolean(checked))
                            }
                          />
                        </div>

                        {/* Inline settings per provider */}
                        {hasSettings && enabled && expandedProviders.has(key) && (
                          <div className="pb-4 pl-7">
                            {key === "amazon" && (
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-md border border-border bg-muted/20 p-4">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Region</Label>
                                  <Select
                                    value={settings.data.metadataAmazonDomain}
                                    onValueChange={(v) =>
                                      patchSettings.mutate({
                                        metadataAmazonDomain: v as AmazonDomain,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {amazonDomainOptions.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Choose the Amazon store closest to your region.
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Label className="text-xs text-muted-foreground">Session Cookie</Label>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                      Optional
                                    </Badge>
                                  </div>
                                  <Input
                                    type="password"
                                    defaultValue={settings.data.metadataAmazonCookie}
                                    placeholder="Paste your Amazon session cookie"
                                    onBlur={(e) =>
                                      patchSettings.mutate({
                                        metadataAmazonCookie: e.target.value,
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Helps avoid rate limiting and CAPTCHAs.
                                  </p>
                                </div>
                              </div>
                            )}

                            {key === "google" && (
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-md border border-border bg-muted/20 p-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Label className="text-xs text-muted-foreground">Preferred Language</Label>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                      Optional
                                    </Badge>
                                  </div>
                                  <Input
                                    type="text"
                                    defaultValue={settings.data.metadataGoogleLanguage}
                                    placeholder="e.g. en, nl, de, fr"
                                    onBlur={(e) =>
                                      patchSettings.mutate({
                                        metadataGoogleLanguage: e.target.value,
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    ISO 639-1 language code for result preference.
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Label className="text-xs text-muted-foreground">API Key</Label>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                      Optional
                                    </Badge>
                                  </div>
                                  <Input
                                    type="password"
                                    defaultValue={settings.data.metadataGoogleApiKey}
                                    placeholder="Google Books API key"
                                    onBlur={(e) =>
                                      patchSettings.mutate({
                                        metadataGoogleApiKey: e.target.value,
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Increases rate limits for Google Books API.
                                  </p>
                                </div>
                              </div>
                            )}

                            {key === "hardcover" && (
                              <div className="max-w-sm rounded-md border border-border bg-muted/20 p-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Label className="text-xs text-muted-foreground">API Token</Label>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                      Optional
                                    </Badge>
                                  </div>
                                  <Input
                                    type="password"
                                    defaultValue={settings.data.metadataHardcoverApiKey}
                                    placeholder="Hardcover API token"
                                    onBlur={(e) =>
                                      patchSettings.mutate({
                                        metadataHardcoverApiKey: e.target.value,
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Get your token from hardcover.app/account/api
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ================================================================
            AI METADATA RESOLVER
            ================================================================ */}
        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">AI Metadata Resolver</h2>
              {settings.data?.metadataOpenrouterEnabled ? (
                <Badge variant="secondary" className="text-[11px] bg-status-completed/10 text-status-completed">
                  Enabled
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[11px]">
                  Disabled
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Uses a large language model via OpenRouter to merge results from all providers,
              correct mismatched metadata, and fill in missing series information.
            </p>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="space-y-4">
                {/* Toggle row */}
                <div className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <span className="text-sm font-medium">Enable AI resolver</span>
                    <p className="text-xs text-muted-foreground">
                      Requires an OpenRouter API key with credits.
                    </p>
                  </div>
                  <Switch
                    checked={settings.data.metadataOpenrouterEnabled}
                    onCheckedChange={(checked) =>
                      patchSettings.mutate({
                        metadataOpenrouterEnabled: Boolean(checked),
                      })
                    }
                  />
                </div>

                {/* Settings (only when enabled) */}
                {settings.data.metadataOpenrouterEnabled && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-md border border-border bg-muted/20 p-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <Input
                        type="password"
                        defaultValue={settings.data.metadataOpenrouterApiKey}
                        placeholder="sk-or-v1-..."
                        onBlur={(e) =>
                          patchSettings.mutate({
                            metadataOpenrouterApiKey: e.target.value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Get your key at openrouter.ai/keys
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Model</Label>
                      <Input
                        type="text"
                        defaultValue={settings.data.metadataOpenrouterModel}
                        placeholder="google/gemini-2.0-flash-001"
                        onBlur={(e) =>
                          patchSettings.mutate({
                            metadataOpenrouterModel: e.target.value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Any OpenRouter-compatible model identifier.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ================================================================
            STORAGE & LIMITS
            ================================================================ */}
        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <h2 className="text-lg font-semibold tracking-tight">Storage</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure upload limits and storage behavior.
            </p>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Upload Size Limit</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="size-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Maximum file size allowed for a single book upload.
                        Applies to EPUB, PDF, and all other supported formats.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The maximum file size for individual book uploads.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min={1}
                    value={settings.data.uploadLimitMb}
                    onChange={(e) =>
                      patchSettings.mutate({ uploadLimitMb: Number(e.target.value) })
                    }
                    className="h-9 w-20 text-center tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground font-medium">MB</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <div className="flex items-center gap-2.5">
              <Link2 className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-tight">External Links</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure optional links that appear in the app menu.
            </p>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="max-w-2xl rounded-md border border-border bg-muted/20 p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Ebook Download URL</Label>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      Optional
                    </Badge>
                  </div>
                  <Input
                    type="url"
                    defaultValue={settings.data.ebookDownloadUrl}
                    placeholder="https://example.com/downloads"
                    onBlur={(e) =>
                      patchSettings.mutate({
                        ebookDownloadUrl: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave this empty to keep the menu item hidden. When set, it opens in a new tab.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border overflow-hidden">
          <CardHeader className="pb-4 pt-5 px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <TerminalSquare className="size-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold tracking-tight">Activity Log</h2>
                  {activity.data && (
                    <Badge variant="secondary" className="text-[11px] tabular-nums">
                      {activity.data.length}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Recent admin-visible errors from metadata, uploads, and Kobo sync.
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

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => activity.refetch()}
                  disabled={activity.isFetching}
                >
                  <RefreshCw className={activity.isFetching ? "size-4 animate-spin" : "size-4"} />
                  Refresh
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => clearActivity.mutate(activityScope)}
                  disabled={clearActivity.isPending || !activity.data?.length}
                >
                  <Trash2 className="size-4" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-6">
            {activity.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (activity.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12 text-center">
                <AlertTriangle className="mb-3 size-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  When metadata, upload, or Kobo operations fail, they will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(activity.data ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={activityScopeMeta[entry.scope].className}>
                            {activityScopeMeta[entry.scope].label}
                          </Badge>
                          <Badge className={activityLevelClassName[entry.level] ?? activityLevelClassName.INFO}>
                            {entry.level}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{entry.event}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{entry.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatActivityTime(entry.createdAt)}
                            {entry.actorUserId !== null ? ` · actor #${entry.actorUserId}` : ""}
                            {entry.bookId !== null ? ` · book #${entry.bookId}` : ""}
                            {entry.jobId ? ` · job ${entry.jobId}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    {entry.details !== null && (
                      <>
                        <Separator className="my-3" />
                        <pre className="max-h-56 overflow-auto rounded-md bg-background/80 p-3 text-[11px] leading-5 text-muted-foreground">
                          {formatActivityDetails(entry.details)}
                        </pre>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};
