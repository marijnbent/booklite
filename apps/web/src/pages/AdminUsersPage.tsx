import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

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
    <div className="stack">
      <h2>Admin Users</h2>

      <div className="card stack">
        <h3>Create user</h3>
        <div className="row">
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "OWNER" | "MEMBER")}> 
            <option value="MEMBER">MEMBER</option>
            <option value="OWNER">OWNER</option>
          </select>
          <button onClick={() => createUser.mutate()} disabled={createUser.isPending}>
            Create
          </button>
        </div>
      </div>

      <div className="card stack">
        <h3>Users</h3>
        {(users.data ?? []).map((user) => (
          <div key={user.id} className="toolbar">
            <div>
              <strong>{user.username}</strong> <span className="small">({user.email})</span>
              <div className="small">{user.disabledAt ? "Disabled" : "Active"}</div>
            </div>
            <div className="row">
              <select
                value={user.role}
                onChange={(event) =>
                  patchUser.mutate({
                    id: user.id,
                    payload: { role: event.target.value }
                  })
                }
              >
                <option value="OWNER">OWNER</option>
                <option value="MEMBER">MEMBER</option>
              </select>
              <button
                className="secondary"
                onClick={() =>
                  patchUser.mutate({
                    id: user.id,
                    payload: { disabled: !user.disabledAt }
                  })
                }
              >
                {user.disabledAt ? "Enable" : "Disable"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h3>System Settings</h3>
        {settings.data && (
          <div className="stack">
            <label>
              Metadata fallback
              <select
                value={settings.data.metadataProviderFallback}
                onChange={(event) =>
                  patchSettings.mutate({
                    metadataProviderFallback: event.target.value as "google" | "none"
                  })
                }
              >
                <option value="google">Google fallback on Open Library miss</option>
                <option value="none">Open Library only</option>
              </select>
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.data.kepubConversionEnabled}
                onChange={(event) =>
                  patchSettings.mutate({ kepubConversionEnabled: event.target.checked })
                }
              />
              Enable kepub conversion (flag only in v1)
            </label>

            <label>
              Upload limit (MB)
              <input
                type="number"
                value={settings.data.uploadLimitMb}
                onChange={(event) =>
                  patchSettings.mutate({ uploadLimitMb: Number(event.target.value) })
                }
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
