import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { BookLiteLogo } from "@/components/BookLiteLogo";

const LoadingScreen: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4 animate-fade-up">
      <BookLiteLogo className="size-8" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{ ownerOnly?: boolean }> = ({ ownerOnly = false }) => {
  const { me, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!me) return <Navigate to="/login" replace />;
  if (ownerOnly && me.role !== "OWNER") return <Navigate to="/library" replace />;

  return <Outlet />;
};
