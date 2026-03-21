import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Book,
  Upload,
  TabletSmartphone,
  User,
  Shield,
  Key,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  CircleHelp,
  ChevronsUpDown,
  Download,
  TerminalSquare,
} from "lucide-react";

const navItems = [
  { to: "/library", label: "Library", icon: Book },
  { to: "/uploads", label: "Upload", icon: Upload },
  { to: "/kobo", label: "Kobo", icon: TabletSmartphone },
  { to: "/docs", label: "Docs", icon: CircleHelp },
];

const adminItems = [
  { to: "/admin-users", label: "Admin", icon: Shield, ownerOnly: true },
  { to: "/admin-activity", label: "Activity", icon: TerminalSquare, ownerOnly: true },
  { to: "/admin-api", label: "API", icon: Key, ownerOnly: true },
];

interface PublicAppSettings {
  ebookDownloadUrl: string;
}

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
} & (
  | { to: string; href?: never }
  | { href: string; to?: never }
);

export const AppShell: React.FC = () => {
  const { me, logout } = useAuth();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isReaderRoute =
    location.pathname.startsWith("/library/") && location.pathname.endsWith("/read");
  const publicSettings = useQuery({
    queryKey: ["public-app-settings"],
    queryFn: () => apiFetch<PublicAppSettings>("/api/v1/app-settings/public"),
  });
  const ebookDownloadUrl = publicSettings.data?.ebookDownloadUrl?.trim() ?? "";
  const topItems: NavItem[] = ebookDownloadUrl
    ? [...navItems, { href: ebookDownloadUrl, label: "Ebooks", icon: Download }]
    : navItems;

  const visibleAdminItems = adminItems.filter((i) => !i.ownerOnly || me?.role === "OWNER");

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex items-center gap-3 px-3 py-2 text-[13px] rounded-lg transition-all duration-150",
      isActive
        ? "bg-primary/10 text-primary font-semibold"
        : "font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
    );

  const iconClass = (isActive: boolean) =>
    cn(
      "size-4 shrink-0 transition-colors duration-150",
      isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
    );

  const renderNavItem = (item: NavItem, closeMobile = false) => {
    if ("href" in item) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          onClick={() => closeMobile && setMobileOpen(false)}
          className={cn(
            "group relative flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150",
            "text-muted-foreground hover:text-foreground hover:bg-accent/60"
          )}
        >
          <item.icon className={iconClass(false)} />
          {item.label}
        </a>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={() => closeMobile && setMobileOpen(false)}
        className={linkClass}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary" />
            )}
            <item.icon className={iconClass(isActive)} />
            {item.label}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      {!isReaderRoute && (
        <aside className="hidden md:flex w-52 shrink-0 flex-col sticky top-0 h-screen bg-card border-r border-border/60">
          <div className="flex items-center gap-2.5 px-5 h-14">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/15">
              <Book className="size-4 text-primary" />
            </div>
            <span className="text-[15px] font-bold tracking-tight">BookLite</span>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
            {topItems.map((item) => renderNavItem(item))}

            {visibleAdminItems.length > 0 && (
              <>
                <div className="mt-auto" />
                <Separator className="my-2" />
                {visibleAdminItems.map((item) => renderNavItem(item))}
              </>
            )}
          </nav>

          <div className="px-3 pb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:bg-accent/60 transition-colors">
                  <div className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary shrink-0 ring-2 ring-primary/20">
                    {me?.username?.slice(0, 2).toUpperCase() ?? "?"}
                  </div>
                  <span className="truncate font-medium text-foreground/80">{me?.username}</span>
                  <ChevronsUpDown className="size-3.5 ml-auto text-muted-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-44">
                <DropdownMenuItem asChild>
                  <NavLink to="/profile">
                    <User className="size-4" />
                    Profile
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>
                  {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {resolved === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleLogout()} className="text-destructive focus:text-destructive">
                  <LogOut className="size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {!isReaderRoute && (
          <>
            <header className="md:hidden flex items-center justify-between h-12 px-4 border-b border-border/60 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/12 ring-1 ring-primary/15">
                  <Book className="size-3.5 text-primary" />
                </div>
                <span className="text-sm font-bold tracking-tight">BookLite</span>
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </header>

            {mobileOpen && (
              <nav className="md:hidden border-b border-border/60 bg-card shadow-sm p-2.5 flex flex-col gap-0.5 animate-fade-in">
                {topItems.map((item) => renderNavItem(item, true))}
                {visibleAdminItems.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    {visibleAdminItems.map((item) => renderNavItem(item, true))}
                  </>
                )}
                <Separator className="my-2" />
                <div className="px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  {me?.username}
                </div>
                {renderNavItem({ to: "/profile", label: "Profile", icon: User }, true)}
              </nav>
            )}
          </>
        )}

        <main
          className={cn(
            "flex-1 animate-fade-in",
            isReaderRoute ? "overflow-hidden p-0" : "p-4 sm:p-6 lg:p-8"
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
