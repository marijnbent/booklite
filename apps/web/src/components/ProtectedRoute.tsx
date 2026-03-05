import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Book } from "lucide-react";

const LoadingScreen: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4 animate-fade-up">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
        <Book className="size-6 text-primary animate-pulse-soft" />
      </div>
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
