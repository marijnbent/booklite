import React from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AccentPicker } from "@/components/AccentPicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, Shield, Key, LogOut, Sun, Moon, CircleHelp, ExternalLink, TerminalSquare } from "lucide-react";

const navItems = [
  { to: "/library", label: "Library" },
  { to: "/uploads", label: "Upload" },
  { to: "/kobo", label: "Kobo" },
  { to: "/docs", label: "Docs" },
];
const adminItems = [
  { to: "/admin-users", label: "Admin", icon: Shield },
  { to: "/admin-activity", label: "Activity", icon: TerminalSquare },
  { to: "/admin-api", label: "API", icon: Key },
];

export const AppShell: React.FC = () => {
  const { me, logout, endImpersonation, impersonation, isImpersonating } = useAuth();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isReaderRoute = location.pathname.startsWith("/library/") && location.pathname.endsWith("/read");
  const publicSettings = useQuery({
    queryKey: ["public-app-settings"],
    queryFn: () => apiFetch<{ ebookDownloadUrl: string }>("/api/v1/app-settings/public"),
  });
  const ebookDownloadUrl = publicSettings.data?.ebookDownloadUrl?.trim() ?? "";
  const showAdminNavigation = !isImpersonating && me?.role === "OWNER";

  return (
    <div className={cn("min-h-screen", !isReaderRoute && "app-shell shelf-glow")}>
      {!isReaderRoute && isImpersonating && impersonation && (
        <div className="impersonation-bar">
          <Shield className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Viewing as {impersonation.targetUsername}</span>
          <Button size="sm" onClick={async () => {
            const restorePath = impersonation.restorePath ?? "/admin-users";
            await endImpersonation();
            navigate(restorePath, { replace: true });
          }}>Return to admin</Button>
        </div>
      )}
      <main className={isReaderRoute ? "overflow-hidden p-0" : "shelf-content"}><Outlet /></main>
      {!isReaderRoute && (
        <nav className={cn("shelf-dock", showAdminNavigation && "has-admin")} aria-label="Main navigation">
          <div className="dock-primary">
            <NavLink to="/library" aria-label="BookLite" className="shelf-mark"><i /><i /><i /></NavLink>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => cn("dock-link", isActive && "active", item.label === "Docs" && "hidden sm:flex")}>
                {item.label}
              </NavLink>
            ))}
            {ebookDownloadUrl && (
              <a href={ebookDownloadUrl} target="_blank" rel="noreferrer" className="dock-link gap-1.5">
                Download<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              </a>
            )}
          </div>
          {showAdminNavigation && (
            <div className="dock-admin" role="group" aria-label="Administration">
              {adminItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => cn("dock-link gap-1.5", isActive && "active")}>
                  <item.icon className="size-3.5 shrink-0" aria-hidden="true" />{item.label}
                </NavLink>
              ))}
            </div>
          )}
          <div className="dock-account">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="dock-avatar" aria-label="Account menu">{me?.username.slice(0, 2).toUpperCase() ?? "?"}</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-60">
                <p className="px-2 py-2 text-xs text-muted-foreground">{me?.username} · {me?.role.toLowerCase()}</p>
                <DropdownMenuItem asChild><NavLink to="/profile"><User className="size-4" />Profile</NavLink></DropdownMenuItem>
                <DropdownMenuItem asChild className="sm:hidden"><NavLink to="/docs"><CircleHelp className="size-4" />Docs</NavLink></DropdownMenuItem>
                <DropdownMenuSeparator />
                <AccentPicker menu />
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>
                  {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {resolved === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => { await logout(); navigate("/login"); }}><LogOut className="size-4" />Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      )}
    </div>
  );
};
