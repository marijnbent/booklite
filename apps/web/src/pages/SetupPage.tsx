import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ completed: boolean }>("/api/v1/setup/status")
      .then((result) => {
        if (result.completed) {
          navigate("/login");
        }
      })
      .finally(() => setStatusLoading(false));
  }, []);

  if (statusLoading) return <p>Checking setup…</p>;

  return (
    <div className="card" style={{ maxWidth: 560, margin: "80px auto" }}>
      <h2>Initial Owner Setup</h2>
      <p className="small">Create the first OWNER account.</p>
      <div className="stack">
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
        {error && <p style={{ color: "#b42318" }}>{error}</p>}
        <button
          onClick={async () => {
            try {
              await apiFetch("/api/v1/setup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, username, password })
              });
              navigate("/login");
            } catch (setupError) {
              setError(String(setupError));
            }
          }}
        >
          Create Owner
        </button>
      </div>
    </div>
  );
};
