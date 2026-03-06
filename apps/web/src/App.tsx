import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { SetupPage } from "@/pages/SetupPage";
import { LibraryPage } from "@/pages/LibraryPage";

import { UploadsPage } from "@/pages/UploadsPage";
import { KoboPage } from "@/pages/KoboPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminUsersPage } from "@/pages/AdminUsersPage";
import { DocsPage } from "@/pages/DocsPage";
import { ReaderPage } from "@/pages/ReaderPage";

export const App: React.FC = () => (
  <Routes>
    <Route path="/setup" element={<SetupPage />} />
    <Route path="/login" element={<LoginPage />} />

    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:bookId/read" element={<ReaderPage />} />

        <Route path="/uploads" element={<UploadsPage />} />
        <Route path="/kobo" element={<KoboPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route element={<ProtectedRoute ownerOnly />}>
          <Route path="/admin-users" element={<AdminUsersPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/library" replace />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/library" replace />} />
  </Routes>
);
