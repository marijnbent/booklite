import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="card" style={{ maxWidth: 480, margin: "80px auto" }}>
      <h2>Sign In</h2>
      <div className="stack">
        <input
          placeholder="Username or email"
          value={usernameOrEmail}
          onChange={(event) => setUsernameOrEmail(event.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p style={{ color: "#b42318" }}>{error}</p>}
        <button
          onClick={async () => {
            setError("");
            try {
              await login(usernameOrEmail, password);
              navigate("/library");
            } catch {
              setError("Login failed. Check credentials.");
            }
          }}
        >
          Login
        </button>
      </div>
    </div>
  );
};
