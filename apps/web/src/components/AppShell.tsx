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

  /* Shared nav link renderer for both primary and footer items */
  const renderNavItem = (item: NavItem) => (
    <Tooltip key={item.to}>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
              "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-muted/30",
              isActive && "text-sidebar-foreground bg-transparent",
              collapsed && "justify-center px-2"
            )
          }
        >
          {/* Active indicator bar */}
          {({ isActive }: { isActive: boolean }) => (
            <>
              <span
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-sidebar-accent transition-all duration-300",
                  isActive ? "h-4 opacity-100" : "h-0 opacity-0"
                )}
              />
              <span className={cn(
                "shrink-0 transition-colors duration-200",
                isActive ? "text-sidebar-accent" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80"
              )}>
                {item.icon}
              </span>
              {!collapsed && <span className={isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/75 group-hover:text-sidebar-foreground"}>{item.label}</span>}
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">
          {item.label}
        </TooltipContent>
      )}
    </Tooltip>
  );

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-3 px-3 py-1.5",
        collapsed && "justify-center px-0"
      )}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-accent/25 to-sidebar-accent/10">
          <Book className="size-4 text-sidebar-accent" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            BookLite
          </span>
        )}
      </div>

      {/* Subtle divider */}
      <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-sidebar-muted/50 to-transparent" />

      {/* Primary navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-1">
        {visiblePrimaryNavItems.map(renderNavItem)}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto space-y-1">
        {/* Gradient divider */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-sidebar-muted/50 to-transparent" />

        {/* Footer nav */}
        <nav className="flex flex-col gap-0.5 px-1 pt-2">
          {visibleFooterNavItems.map(renderNavItem)}
        </nav>

        {/* User section -- integrated feel */}
        {!collapsed && (
          <div className="mx-2 mt-2 flex items-center gap-3 rounded-lg px-2 py-2.5 bg-sidebar-muted/20">
            <Avatar className="size-7">
              <AvatarFallback className="bg-sidebar-accent/15 text-sidebar-accent text-[10px] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-medium text-sidebar-foreground truncate leading-tight">
                {me?.username}
              </span>
              <span className="text-[10px] text-sidebar-foreground/35 uppercase tracking-[0.08em] font-medium">
                {me?.role}
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle -- desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/50 hover:text-sidebar-foreground/70 hover:bg-sidebar-muted/20 transition-colors cursor-pointer mt-1",
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
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar -- desktop */}
      <aside
        className={cn(
          "hidden md:flex flex-col sticky top-0 h-screen bg-sidebar px-2 py-4 transition-all duration-300 ease-out",
          /* Subtle right edge instead of solid border */
          "border-r border-sidebar-muted/20",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar -- mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-sidebar px-2 py-4 transition-transform duration-300 ease-out md:hidden",
          "border-r border-sidebar-muted/20 shadow-2xl shadow-black/30",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button for mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-2 top-3 flex size-7 items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-muted/30 transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top header bar -- glass effect with gradient bottom border */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-background/70 px-4 backdrop-blur-xl md:px-6 border-b border-border/30">
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
              <Button variant="ghost" size="icon" className="shrink-0 size-8 rounded-lg">
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
              <Button variant="ghost" size="icon" className="shrink-0 size-8 rounded-full">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
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

        {/* Page content -- generous spacing */}
        <main className="flex-1 p-5 md:p-7 lg:p-8 animate-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
