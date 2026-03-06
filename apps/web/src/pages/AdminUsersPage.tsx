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
// Reusable sub-components
// ---------------------------------------------------------------------------

/** Section heading with icon block, matching the ProfilePage pattern */
function SectionHeader({
  icon,
  title,
  description,
  badge,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Small uppercase label used for field groups */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

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

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserItem[]>("/api/v1/users"),
  });

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => apiFetch<AppSettings>("/api/v1/app-settings"),
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
      <div className="space-y-8">
        {/* ================================================================
            PAGE HEADER
            ================================================================ */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users, metadata providers, and system configuration
          </p>
        </div>

        {/* ================================================================
            USERS SECTION
            ================================================================ */}
        <Card className="border-border/40 overflow-hidden">
          {/* Gradient banner like ProfilePage */}
          <div className="h-1.5 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent" />

          <CardHeader className="pb-4">
            <SectionHeader
              icon={<Users className="size-4 text-muted-foreground" />}
              title="Users"
              description="Manage who has access to your BookLite instance"
              badge={
                users.data ? (
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {users.data.length}
                  </Badge>
                ) : undefined
              }
              action={
                <Button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  size="sm"
                  variant={showCreateForm ? "secondary" : "default"}
                  className="shrink-0 shadow-sm shadow-primary/10 active:scale-[0.97] transition-all duration-200"
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
              }
            />
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Create user form (collapsible) */}
            {showCreateForm && (
              <div className="animate-scale-in rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.03] to-transparent p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                    <UserPlus className="size-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">New User</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createUser.mutate();
                  }}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div className="space-y-1.5">
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Username</FieldLabel>
                    <Input
                      type="text"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Password</FieldLabel>
                    <Input
                      type="password"
                      placeholder="Strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Role</FieldLabel>
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
                    <Button
                      type="submit"
                      disabled={createUser.isPending}
                      className="shadow-sm shadow-primary/10 active:scale-[0.97] transition-all duration-200"
                    >
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
                <Loader2 className="size-5 text-primary animate-spin" />
              </div>
            ) : (users.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 mb-3">
                  <Users className="size-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No users yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Create your first user to get started
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="text-[11px] uppercase tracking-[0.08em] font-semibold">
                        User
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.08em] font-semibold">
                        Role
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.08em] font-semibold">
                        Status
                      </TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.08em] font-semibold text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(users.data ?? []).map((user, i) => (
                      <TableRow
                        key={user.id}
                        className="group transition-colors duration-150"
                        style={{
                          animationDelay: `${i * 40}ms`,
                          animation: "fade-up 0.3s ease-out both",
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {/* Avatar circle with initials */}
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-[11px] font-bold text-primary uppercase">
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
                            <Badge variant="destructive" className="text-[10px]">
                              Disabled
                            </Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={user.disabledAt ? "outline" : "secondary"}
                            size="sm"
                            className="h-7 text-xs active:scale-[0.97] transition-all duration-200"
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
        <Card className="border-border/40 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-status-processing/30 via-status-processing/10 to-transparent" />

          <CardHeader className="pb-4">
            <SectionHeader
              icon={<Library className="size-4 text-muted-foreground" />}
              title="Metadata Providers"
              description="BookLite fetches book data from multiple sources and intelligently merges the best result for each field. Enable the providers you want to use."
              badge={
                settings.data ? (
                  <Badge variant="info" className="text-[10px] tabular-nums">
                    {enabledCount} active
                  </Badge>
                ) : undefined
              }
            />
          </CardHeader>

          <CardContent>
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-primary animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="space-y-2">
                {(Object.keys(providerMeta) as EnabledMetadataProvider[]).map(
                  (key, i) => {
                    const meta = providerMeta[key];
                    const enabled = settings.data.metadataProviderEnabled[key];
                    const hasSettings = providerHasSettings(key);
                    const isExpanded = expandedProviders.has(key);

                    return (
                      <div
                        key={key}
                        className={`
                          rounded-xl border transition-all duration-200
                          ${enabled
                            ? "border-border/60 bg-card"
                            : "border-border/30 bg-muted/20"
                          }
                        `}
                        style={{
                          animationDelay: `${i * 50}ms`,
                          animation: "fade-up 0.35s ease-out both",
                        }}
                      >
                        {/* Provider row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Icon */}
                          <div
                            className={`
                              flex size-8 shrink-0 items-center justify-center rounded-lg
                              transition-colors duration-200
                              ${enabled ? "bg-primary/8" : "bg-muted/60"}
                            `}
                          >
                            <span className={enabled ? meta.color : "text-muted-foreground/50"}>
                              {meta.icon}
                            </span>
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-medium transition-colors duration-200 ${
                                  enabled ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <p className="text-[12px] leading-relaxed text-muted-foreground/70 hidden sm:block">
                              {meta.description}
                            </p>
                          </div>

                          {/* Expand button (only if has settings) */}
                          {hasSettings && enabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleProviderExpanded(key)}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isExpanded ? "Hide settings" : "Configure"}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Toggle */}
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              updateProviderEnabled(key, Boolean(checked))
                            }
                          />
                        </div>

                        {/* Expandable settings per provider */}
                        {hasSettings && enabled && isExpanded && (
                          <div className="animate-scale-in border-t border-border/30 bg-muted/10 px-4 py-4">
                            {key === "amazon" && (
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="size-3 text-muted-foreground" />
                                    <FieldLabel>Region</FieldLabel>
                                  </div>
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
                                  <p className="text-[11px] text-muted-foreground/60">
                                    Choose the Amazon store closest to your region
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Cookie className="size-3 text-muted-foreground" />
                                    <FieldLabel>Session Cookie</FieldLabel>
                                    <Badge variant="secondary" className="text-[9px] py-0 px-1">
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
                                  <p className="text-[11px] text-muted-foreground/60">
                                    Helps avoid rate limiting and CAPTCHAs
                                  </p>
                                </div>
                              </div>
                            )}

                            {key === "google" && (
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Languages className="size-3 text-muted-foreground" />
                                    <FieldLabel>Preferred Language</FieldLabel>
                                    <Badge variant="secondary" className="text-[9px] py-0 px-1">
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
                                  <p className="text-[11px] text-muted-foreground/60">
                                    ISO 639-1 language code for result preference
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Key className="size-3 text-muted-foreground" />
                                    <FieldLabel>API Key</FieldLabel>
                                    <Badge variant="secondary" className="text-[9px] py-0 px-1">
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
                                  <p className="text-[11px] text-muted-foreground/60">
                                    Increases rate limits for Google Books API
                                  </p>
                                </div>
                              </div>
                            )}

                            {key === "hardcover" && (
                              <div className="max-w-sm space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Key className="size-3 text-muted-foreground" />
                                  <FieldLabel>API Token</FieldLabel>
                                  <Badge variant="secondary" className="text-[9px] py-0 px-1">
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
                                <p className="text-[11px] text-muted-foreground/60">
                                  Get your token from hardcover.app/account/api
                                </p>
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
        <Card className="border-border/40 overflow-hidden relative">
          {/* Subtle shimmer accent for AI section */}
          <div className="h-1.5 bg-gradient-to-r from-purple-500/30 via-pink-500/20 to-amber-500/10" />

          <CardHeader className="pb-4">
            <SectionHeader
              icon={<Sparkles className="size-4 text-muted-foreground" />}
              title="AI Metadata Resolver"
              description="Uses a large language model via OpenRouter to intelligently merge results from all providers, correct mismatched metadata, and fill in missing series information."
              badge={
                settings.data?.metadataOpenrouterEnabled ? (
                  <Badge variant="success" className="text-[10px]">
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Disabled
                  </Badge>
                )
              }
            />
          </CardHeader>

          <CardContent>
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-primary animate-spin" />
              </div>
            ) : settings.data ? (
              <div className="space-y-4">
                {/* Toggle row */}
                <div
                  className={`
                    flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all duration-200
                    ${settings.data.metadataOpenrouterEnabled
                      ? "border-purple-500/20 bg-purple-500/[0.03]"
                      : "border-border/40"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        flex size-8 items-center justify-center rounded-lg transition-colors duration-200
                        ${settings.data.metadataOpenrouterEnabled
                          ? "bg-purple-500/10"
                          : "bg-muted/50"
                        }
                      `}
                    >
                      <Brain
                        className={`size-4 transition-colors duration-200 ${
                          settings.data.metadataOpenrouterEnabled
                            ? "text-purple-600 dark:text-purple-400"
                            : "text-muted-foreground/50"
                        }`}
                      />
                    </div>
                    <div>
                      <span className="text-sm font-medium">Enable AI resolver</span>
                      <p className="text-[12px] text-muted-foreground/70">
                        Requires an OpenRouter API key with credits
                      </p>
                    </div>
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
                  <div className="animate-scale-in grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border/30 bg-muted/10 p-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Key className="size-3 text-muted-foreground" />
                        <FieldLabel>API Key</FieldLabel>
                      </div>
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
                      <p className="text-[11px] text-muted-foreground/60">
                        Get your key at openrouter.ai/keys
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Brain className="size-3 text-muted-foreground" />
                        <FieldLabel>Model</FieldLabel>
                      </div>
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
                      <p className="text-[11px] text-muted-foreground/60">
                        Any OpenRouter-compatible model identifier
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
        <Card className="border-border/40 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-status-completed/30 via-status-completed/10 to-transparent" />

          <CardHeader className="pb-4">
            <SectionHeader
              icon={<HardDrive className="size-4 text-muted-foreground" />}
              title="Storage"
              description="Configure upload limits and storage behavior"
            />
          </CardHeader>

          <CardContent>
            {settings.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 text-primary animate-spin" />
              </div>
            ) : settings.data ? (
              <div
                className="flex items-start gap-4 rounded-xl border border-border/40 px-4 py-4"
                style={{ animation: "fade-up 0.35s ease-out both" }}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-completed/10">
                  <Upload className="size-4 text-status-completed" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Upload Size Limit</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="size-3 text-muted-foreground/50" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Maximum file size allowed for a single book upload.
                        Applies to EPUB, PDF, and all other supported formats.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[12px] text-muted-foreground/70">
                    The maximum file size for individual book uploads
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
      </div>
    </TooltipProvider>
  );
};
