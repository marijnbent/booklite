import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  UserPlus,
  Users,
  Settings,
  Loader2,
} from "lucide-react";

interface UserItem {
  id: number;
  email: string;
  username: string;
  role: "OWNER" | "MEMBER";
  disabledAt: string | null;
  createdAt: string;
}

interface AppSettings {
  metadataProviderPrimary: MetadataProvider;
  metadataProviderSecondary: MetadataProvider;
  metadataProviderTertiary: MetadataProvider;
  metadataAmazonDomain: AmazonDomain;
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  metadataComicvineApiKey: string;
  metadataAudibleDomain: AudibleDomain;
  uploadLimitMb: number;
}

type MetadataProvider =
  | "open_library"
  | "amazon"
  | "google"
  | "hardcover"
  | "goodreads"
  | "douban"
  | "lubimyczytac"
  | "ranobedb"
  | "comicvine"
  | "audible"
  | "none";
type AmazonDomain = "com" | "co.uk" | "de" | "fr" | "es" | "it" | "nl" | "ca" | "com.au";
type AudibleDomain = "com" | "co.uk" | "de" | "fr" | "it" | "ca" | "com.au";

const metadataProviderOptions: Array<{ value: MetadataProvider; label: string }> = [
  { value: "open_library", label: "Open Library" },
  { value: "amazon", label: "Amazon" },
  { value: "google", label: "Google Books" },
  { value: "hardcover", label: "Hardcover" },
  { value: "goodreads", label: "Goodreads" },
  { value: "douban", label: "Douban" },
  { value: "lubimyczytac", label: "Lubimyczytac" },
  { value: "ranobedb", label: "RanobeDB" },
  { value: "comicvine", label: "Comic Vine" },
  { value: "audible", label: "Audible" },
  { value: "none", label: "None" }
];

const amazonDomainOptions: Array<{ value: AmazonDomain; label: string }> = [
  { value: "com", label: "amazon.com" },
  { value: "co.uk", label: "amazon.co.uk" },
  { value: "de", label: "amazon.de" },
  { value: "fr", label: "amazon.fr" },
  { value: "es", label: "amazon.es" },
  { value: "it", label: "amazon.it" },
  { value: "nl", label: "amazon.nl" },
  { value: "ca", label: "amazon.ca" },
  { value: "com.au", label: "amazon.com.au" }
];

const audibleDomainOptions: Array<{ value: AudibleDomain; label: string }> = [
  { value: "com", label: "audible.com" },
  { value: "co.uk", label: "audible.co.uk" },
  { value: "de", label: "audible.de" },
  { value: "fr", label: "audible.fr" },
  { value: "it", label: "audible.it" },
  { value: "ca", label: "audible.ca" },
  { value: "com.au", label: "audible.com.au" }
];

export const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserItem[]>("/api/v1/users")
  });

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => apiFetch<AppSettings>("/api/v1/app-settings")
  });

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch<UserItem>("/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username, password, role })
      }),
    onSuccess: () => {
      setEmail("");
      setUsername("");
      setPassword("");
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });

  const patchUser = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiFetch(`/api/v1/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });

  const patchSettings = useMutation({
    mutationFn: (payload: Partial<AppSettings>) =>
      apiFetch("/api/v1/app-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-settings"] })
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and system settings
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          size="sm"
        >
          <UserPlus className="size-4" />
          {showCreateForm ? "Cancel" : "Create User"}
        </Button>
      </div>

      {/* Create user form */}
      {showCreateForm && (
        <Card className="border-border/40 border-primary/20 animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <UserPlus className="size-3.5 text-primary" />
              </div>
              Create New User
            </CardTitle>
            <CardDescription>
              Add a new member or owner account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUser.mutate();
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-username">Username</Label>
                <Input
                  id="new-username"
                  type="text"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "OWNER" | "MEMBER")}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="OWNER">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
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
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
              <Users className="size-3.5 text-primary" />
            </div>
            Users
            {users.data && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {users.data.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users.data ?? []).map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{user.username}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) =>
                            patchUser.mutate({ id: user.id, payload: { role: v } })
                          }
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OWNER">Owner</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {user.disabledAt ? (
                          <Badge variant="destructive" className="text-[10px]">Disabled</Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">Active</Badge>
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
                              payload: { disabled: !user.disabledAt }
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

      {/* System settings */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
              <Settings className="size-3.5 text-primary" />
            </div>
            System Settings
          </CardTitle>
          <CardDescription>
            Global configuration for your BookLite instance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 text-primary animate-spin" />
            </div>
          ) : settings.data ? (
            <div className="space-y-5">
              {/* Metadata providers */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Metadata providers</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose provider order and optional API keys.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="metadata-primary">Primary</Label>
                    <Select
                      value={settings.data.metadataProviderPrimary}
                      onValueChange={(v) =>
                        patchSettings.mutate({
                          metadataProviderPrimary: v as MetadataProvider
                        })
                      }
                    >
                      <SelectTrigger id="metadata-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metadataProviderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-secondary">Secondary</Label>
                    <Select
                      value={settings.data.metadataProviderSecondary}
                      onValueChange={(v) =>
                        patchSettings.mutate({
                          metadataProviderSecondary: v as MetadataProvider
                        })
                      }
                    >
                      <SelectTrigger id="metadata-secondary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metadataProviderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-tertiary">Tertiary</Label>
                    <Select
                      value={settings.data.metadataProviderTertiary}
                      onValueChange={(v) =>
                        patchSettings.mutate({
                          metadataProviderTertiary: v as MetadataProvider
                        })
                      }
                    >
                      <SelectTrigger id="metadata-tertiary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metadataProviderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="metadata-amazon-domain">Amazon region</Label>
                    <Select
                      value={settings.data.metadataAmazonDomain}
                      onValueChange={(v) =>
                        patchSettings.mutate({
                          metadataAmazonDomain: v as AmazonDomain
                        })
                      }
                    >
                      <SelectTrigger id="metadata-amazon-domain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {amazonDomainOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-amazon-cookie">Amazon cookie (optional)</Label>
                    <Input
                      id="metadata-amazon-cookie"
                      type="password"
                      defaultValue={settings.data.metadataAmazonCookie}
                      placeholder="Paste Amazon session cookie"
                      onBlur={(e) =>
                        patchSettings.mutate({
                          metadataAmazonCookie: e.target.value
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-google-language">Google language (optional)</Label>
                    <Input
                      id="metadata-google-language"
                      type="text"
                      defaultValue={settings.data.metadataGoogleLanguage}
                      placeholder="e.g. en, nl, de"
                      onBlur={(e) =>
                        patchSettings.mutate({
                          metadataGoogleLanguage: e.target.value
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-google-api-key">Google Books API key (optional)</Label>
                    <Input
                      id="metadata-google-api-key"
                      type="password"
                      defaultValue={settings.data.metadataGoogleApiKey}
                      placeholder="Enter Google Books API key"
                      onBlur={(e) =>
                        patchSettings.mutate({
                          metadataGoogleApiKey: e.target.value
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-hardcover-api-key">Hardcover API token (optional)</Label>
                    <Input
                      id="metadata-hardcover-api-key"
                      type="password"
                      defaultValue={settings.data.metadataHardcoverApiKey}
                      placeholder="Enter Hardcover API token"
                      onBlur={(e) =>
                        patchSettings.mutate({
                          metadataHardcoverApiKey: e.target.value
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-comicvine-api-key">Comic Vine API token (optional)</Label>
                    <Input
                      id="metadata-comicvine-api-key"
                      type="password"
                      defaultValue={settings.data.metadataComicvineApiKey}
                      placeholder="Enter Comic Vine API token"
                      onBlur={(e) =>
                        patchSettings.mutate({
                          metadataComicvineApiKey: e.target.value
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metadata-audible-domain">Audible region</Label>
                    <Select
                      value={settings.data.metadataAudibleDomain}
                      onValueChange={(v) =>
                        patchSettings.mutate({
                          metadataAudibleDomain: v as AudibleDomain
                        })
                      }
                    >
                      <SelectTrigger id="metadata-audible-domain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {audibleDomainOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Upload limit */}
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="upload-limit">Upload limit (MB)</Label>
                <Input
                  id="upload-limit"
                  type="number"
                  min={1}
                  value={settings.data.uploadLimitMb}
                  onChange={(e) =>
                    patchSettings.mutate({ uploadLimitMb: Number(e.target.value) })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Maximum file size for book uploads
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
