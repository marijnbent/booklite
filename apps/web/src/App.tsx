import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Book } from "lucide-react";

const AppShell = lazy(async () => {
  const module = await import("@/components/AppShell");
  return { default: module.AppShell };
});

const LoginPage = lazy(async () => {
  const module = await import("@/pages/LoginPage");
  return { default: module.LoginPage };
});

const SetupPage = lazy(async () => {
  const module = await import("@/pages/SetupPage");
  return { default: module.SetupPage };
});

const LibraryPage = lazy(async () => {
  const module = await import("@/pages/LibraryPage");
  return { default: module.LibraryPage };
});

const UploadsPage = lazy(async () => {
  const module = await import("@/pages/UploadsPage");
  return { default: module.UploadsPage };
});

const KoboPage = lazy(async () => {
  const module = await import("@/pages/KoboPage");
  return { default: module.KoboPage };
});

const ProfilePage = lazy(async () => {
  const module = await import("@/pages/ProfilePage");
  return { default: module.ProfilePage };
});

const AdminActivityPage = lazy(async () => {
  const module = await import("@/pages/AdminActivityPage");
  return { default: module.AdminActivityPage };
});

const AdminUsersPage = lazy(async () => {
  const module = await import("@/pages/AdminUsersPage");
  return { default: module.AdminUsersPage };
});

const AdminApiDocsPage = lazy(async () => {
  const module = await import("@/pages/AdminApiDocsPage");
  return { default: module.AdminApiDocsPage };
});

const DocsPage = lazy(async () => {
  const module = await import("@/pages/DocsPage");
  return { default: module.DocsPage };
});

const ReaderPage = lazy(async () => {
  const module = await import("@/pages/ReaderPage");
  return { default: module.ReaderPage };
});

const RouteLoadingScreen: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4 animate-fade-up">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
        <Book className="size-6 animate-pulse-soft text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Loading page...</p>
    </div>
  </div>
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<RouteLoadingScreen />}>{element}</Suspense>
);

export const App: React.FC = () => (
  <Routes>
    <Route path="/setup" element={withSuspense(<SetupPage />)} />
    <Route path="/login" element={withSuspense(<LoginPage />)} />

    <Route element={<ProtectedRoute />}>
      <Route element={withSuspense(<AppShell />)}>
        <Route path="/library" element={withSuspense(<LibraryPage />)} />
        <Route path="/library/:bookId/read" element={withSuspense(<ReaderPage />)} />

        <Route path="/uploads" element={withSuspense(<UploadsPage />)} />
        <Route path="/kobo" element={withSuspense(<KoboPage />)} />
        <Route path="/docs" element={withSuspense(<DocsPage />)} />
        <Route path="/profile" element={withSuspense(<ProfilePage />)} />

        <Route element={<ProtectedRoute ownerOnly />}>
          <Route path="/admin-users" element={withSuspense(<AdminUsersPage />)} />
          <Route path="/admin-activity" element={withSuspense(<AdminActivityPage />)} />
          <Route path="/admin-api" element={withSuspense(<AdminApiDocsPage />)} />
        </Route>

        <Route path="/" element={<Navigate to="/library" replace />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/library" replace />} />
  </Routes>
);
