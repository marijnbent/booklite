import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Book,
  FolderOpen,
  Upload,
  TabletSmartphone,
  User,
  Shield,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  CircleHelp,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  ownerOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/library", label: "Library", icon: <Book className="size-4" /> },
  { to: "/collections", label: "Collections", icon: <FolderOpen className="size-4" /> },
  { to: "/uploads", label: "Uploads", icon: <Upload className="size-4" /> },
  { to: "/kobo", label: "Kobo", icon: <TabletSmartphone className="size-4" /> },
  { to: "/profile", label: "Profile", icon: <User className="size-4" /> },
  { to: "/admin-users", label: "Admin", icon: <Shield className="size-4" />, ownerOnly: true },
  { to: "/docs", label: "Docs", icon: <CircleHelp className="size-4" /> },
];

export const AppShell: React.FC = () => {
  const { me, logout } = useAuth();
  const { theme, setTheme, resolved } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = me?.username
    ? me.username.slice(0, 2).toUpperCase()
    : "?";

  const visibleNavItems = navItems.filter(
    (item) => !item.ownerOnly || me?.role === "OWNER"
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6">
          {/* Logo */}
          <NavLink
            to="/library"
            className="flex items-center gap-2 shrink-0 mr-6 group"
          >
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
              <Book className="size-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-bold tracking-tight hidden sm:block" style={{ fontFamily: "Georgia, 'Iowan Old Style', serif" }}>
              BookLite
            </span>
          </NavLink>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors",
                    isActive
                      ? "text-primary bg-primary/8"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0">
                {resolved === "dark" ? (
                  <Moon className="size-4" />
                ) : (
                  <Sun className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="size-4" />
                Light
                {theme === "light" && <span className="ml-auto text-primary">*</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="size-4" />
                Dark
                {theme === "dark" && <span className="ml-auto text-primary">*</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor className="size-4" />
                System
                {theme === "system" && <span className="ml-auto text-primary">*</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{me?.username}</span>
                  <span className="text-xs font-normal text-muted-foreground">{me?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User className="size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleLogout()} className="text-destructive focus:text-destructive">
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden size-8 shrink-0"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/40 bg-background animate-fade-in">
            <nav className="flex flex-col p-2">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "text-primary bg-primary/8"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
        <Outlet />
      </main>
    </div>
  );
};
