import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Menu,
  X,
  CircleHelp,
} from "lucide-react";

const navItems = [
  { to: "/library", label: "Library", icon: <Book className="size-4" /> },
  { to: "/collections", label: "Collections", icon: <FolderOpen className="size-4" /> },
  { to: "/uploads", label: "Upload", icon: <Upload className="size-4" /> },
  { to: "/kobo", label: "Kobo", icon: <TabletSmartphone className="size-4" /> },
  { to: "/docs", label: "Docs", icon: <CircleHelp className="size-4" /> },
];

const bottomItems = [
  { to: "/admin-users", label: "Admin", icon: <Shield className="size-4" />, ownerOnly: true },
  { to: "/profile", label: "Profile", icon: <User className="size-4" /> },
];

export const AppShell: React.FC = () => {
  const { me, logout } = useAuth();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allItems = [
    ...navItems,
    ...bottomItems.filter((i) => !i.ownerOnly || me?.role === "OWNER"),
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-md transition-colors",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-48 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center gap-2 px-4 h-14">
          <Book className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">BookLite</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 pt-1 pb-2">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <div className="h-px bg-border/40 my-1.5" />
          {bottomItems
            .filter((i) => !i.ownerOnly || me?.role === "OWNER")
            .map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="px-2 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent transition-colors">
                <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                  {me?.username?.slice(0, 2).toUpperCase() ?? "?"}
                </div>
                <span className="truncate font-medium">{me?.username}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-40">
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

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between h-12 px-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Book className="size-4 text-primary" />
            <span className="text-sm font-semibold">BookLite</span>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </header>

        {mobileOpen && (
          <nav className="md:hidden border-b border-border/40 p-2 flex flex-col gap-0.5 animate-fade-in">
            {allItems.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={linkClass}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <main className="flex-1 p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
