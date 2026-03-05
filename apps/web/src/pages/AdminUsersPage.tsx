import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Shield,
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
  metadataProviderFallback: "google" | "none";
  kepubConversionEnabled: boolean;
  uploadLimitMb: number;
}

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
              {/* Metadata fallback */}
              <div className="space-y-2">
                <Label htmlFor="metadata-fallback">Metadata provider fallback</Label>
                <Select
                  value={settings.data.metadataProviderFallback}
                  onValueChange={(v) =>
                    patchSettings.mutate({
                      metadataProviderFallback: v as "google" | "none"
                    })
                  }
                >
                  <SelectTrigger id="metadata-fallback" className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google fallback on Open Library miss</SelectItem>
                    <SelectItem value="none">Open Library only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Kepub conversion */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="kepub-toggle" className="text-sm font-medium">
                    Kepub conversion
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable kepub conversion (flag only in v1)
                  </p>
                </div>
                <Switch
                  id="kepub-toggle"
                  checked={settings.data.kepubConversionEnabled}
                  onCheckedChange={(checked) =>
                    patchSettings.mutate({ kepubConversionEnabled: checked })
                  }
                />
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
