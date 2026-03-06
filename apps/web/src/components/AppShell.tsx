import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  ChevronLeft,
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

const primaryNavItems: NavItem[] = [
  { to: "/library", label: "Library", icon: <Book className="size-4" /> },
  { to: "/collections", label: "Collections", icon: <FolderOpen className="size-4" /> },
  { to: "/uploads", label: "Uploads", icon: <Upload className="size-4" /> },
  { to: "/kobo", label: "Kobo", icon: <TabletSmartphone className="size-4" /> },
  { to: "/profile", label: "Profile", icon: <User className="size-4" /> },
  { to: "/admin-users", label: "Admin", icon: <Shield className="size-4" />, ownerOnly: true },
];

const footerNavItems: NavItem[] = [
  { to: "/docs", label: "Docs", icon: <CircleHelp className="size-4" /> },
];

export const AppShell: React.FC = () => {
  const { me, logout } = useAuth();
  const { theme, setTheme, resolved } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = me?.username
    ? me.username.slice(0, 2).toUpperCase()
    : "?";

  const visiblePrimaryNavItems = primaryNavItems.filter(
    (item) => !item.ownerOnly || me?.role === "OWNER"
  );
  const visibleFooterNavItems = footerNavItems.filter(
    (item) => !item.ownerOnly || me?.role === "OWNER"
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-3 px-3 py-1",
        collapsed && "justify-center px-0"
      )}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Book className="size-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">
            BookLite
          </span>
        )}
      </div>

      <Separator className="my-3 bg-sidebar-muted/60" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        {visiblePrimaryNavItems.map((item) => (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>
              <NavLink
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                    "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-muted/50",
                    isActive && "bg-sidebar-muted/70 text-sidebar-foreground shadow-sm",
                    collapsed && "justify-center px-2"
                  )
                }
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                {item.label}
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto space-y-2">
        <Separator className="bg-sidebar-muted/60" />

        {/* User info (expanded only) */}
        {!collapsed && (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <Avatar className="size-7">
              <AvatarFallback className="bg-sidebar-accent/20 text-sidebar-foreground text-[10px]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-sidebar-foreground truncate">
                {me?.username}
              </span>
              <span className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">
                {me?.role}
              </span>
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-1">
          {visibleFooterNavItems.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-muted/50",
                      isActive && "bg-sidebar-muted/70 text-sidebar-foreground shadow-sm",
                      collapsed && "justify-center px-2"
                    )
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>

        {/* Collapse toggle -- desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-muted/30 transition-colors cursor-pointer",
            collapsed && "justify-center px-2"
          )}
        >
          <ChevronLeft className={cn(
            "size-4 transition-transform duration-300",
            collapsed && "rotate-180"
          )} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar -- desktop */}
      <aside
        className={cn(
          "hidden md:flex flex-col sticky top-0 h-screen bg-sidebar px-3 py-4 transition-all duration-300 ease-out border-r border-sidebar-muted/30",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar -- mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-sidebar px-3 py-4 transition-transform duration-300 ease-out md:hidden border-r border-sidebar-muted/30",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button for mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-2 top-3 flex size-7 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-muted/40 transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top header bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-xl md:px-6">
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
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
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
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
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
