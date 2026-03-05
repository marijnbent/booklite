import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export const ProtectedRoute: React.FC<{ ownerOnly?: boolean }> = ({ ownerOnly = false }) => {
  const { me, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  if (ownerOnly && me.role !== "OWNER") return <Navigate to="/library" replace />;

  return <Outlet />;
};
