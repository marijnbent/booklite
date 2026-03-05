import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

interface KoboSettings {
  token: string;
  syncEnabled: boolean;
  twoWayProgressSync: boolean;
  markReadingThreshold: number;
  markFinishedThreshold: number;
}

export const KoboPage: React.FC = () => {
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["kobo-settings"],
    queryFn: () => apiFetch<KoboSettings>("/api/v1/kobo/settings")
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

  if (settings.isLoading) return <p>Loading Kobo settings…</p>;
  const model = settings.data;
  if (!model) return <p>Could not load Kobo settings.</p>;

  return (
    <div className="stack">
      <h2>Kobo</h2>
      <div className="card stack">
        <label className="row">
          <input
            type="checkbox"
            checked={model.syncEnabled}
            onChange={(event) =>
              updateMutation.mutate({ ...model, syncEnabled: event.target.checked })
            }
          />
          Enable sync
        </label>

        <label className="row">
          <input
            type="checkbox"
            checked={model.twoWayProgressSync}
            onChange={(event) =>
              updateMutation.mutate({
                ...model,
                twoWayProgressSync: event.target.checked
              })
            }
          />
          Two-way progress sync
        </label>

        <div className="row">
          <label>
            Mark reading at %
            <input
              type="number"
              value={model.markReadingThreshold}
              onChange={(event) =>
                updateMutation.mutate({
                  ...model,
                  markReadingThreshold: Number(event.target.value)
                })
              }
            />
          </label>
          <label>
            Mark finished at %
            <input
              type="number"
              value={model.markFinishedThreshold}
              onChange={(event) =>
                updateMutation.mutate({
                  ...model,
                  markFinishedThreshold: Number(event.target.value)
                })
              }
            />
          </label>
        </div>

        <div className="stack">
          <label>Kobo token</label>
          <textarea value={model.token} readOnly rows={3} />
          <div className="row">
            <button
              className="secondary"
              onClick={() => navigator.clipboard.writeText(model.token)}
            >
              Copy token
            </button>
            <button
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
            >
              Regenerate token
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
