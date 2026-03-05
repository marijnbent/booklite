import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export const AppShell: React.FC = () => {
  const { me, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="brand">BookLite</h1>
        <div className="small" style={{ marginBottom: 12 }}>
          {me ? `${me.username} (${me.role})` : ""}
        </div>

        <nav className="nav">
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/collections">Collections</NavLink>
          <NavLink to="/uploads">Uploads</NavLink>
          <NavLink to="/kobo">Kobo</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {me?.role === "OWNER" && <NavLink to="/admin-users">Admin Users</NavLink>}
        </nav>

        <div style={{ marginTop: 16 }}>
          <button
            className="secondary"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
};
