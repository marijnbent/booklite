import React from "react";
import { useAuth } from "../lib/auth";

export const ProfilePage: React.FC = () => {
  const { me } = useAuth();

  if (!me) return <p>Not authenticated.</p>;

  return (
    <div className="stack">
      <h2>Profile</h2>
      <div className="card stack">
        <p>
          <strong>Username:</strong> {me.username}
        </p>
        <p>
          <strong>Email:</strong> {me.email}
        </p>
        <p>
          <strong>Role:</strong> {me.role}
        </p>
        <p className="small">Created at {new Date(me.createdAt).toLocaleString()}</p>
      </div>
    </div>
  );
};
