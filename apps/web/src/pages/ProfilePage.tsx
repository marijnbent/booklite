import React from "react";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, Calendar } from "lucide-react";

export const ProfilePage: React.FC = () => {
  const { me } = useAuth();

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Not authenticated.</p>
      </div>
    );
  }

  const initials = me.username.slice(0, 2).toUpperCase();
  const createdDate = new Date(me.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 text-[13px] text-muted-foreground/70 leading-relaxed">
          Your account information
        </p>
      </div>

      <div className="rounded-2xl border border-border/30 bg-card shadow-sm shadow-black/[0.02] dark:shadow-black/[0.08] overflow-hidden">
        {/* Profile header with gradient banner -- richer, multi-stop gradient */}
        <div className="relative h-32 bg-gradient-to-br from-primary/18 via-primary/[0.08] to-status-processing/[0.06] overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="pointer-events-none absolute right-6 top-3 size-24 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="pointer-events-none absolute right-24 bottom-0 size-16 rounded-full bg-status-completed/[0.08] blur-2xl" />
          <div className="pointer-events-none absolute left-1/3 top-0 size-20 rounded-full bg-status-processing/[0.05] blur-2xl" />

          {/* Avatar -- prominent with layered ring */}
          <div className="absolute -bottom-11 left-7">
            <Avatar className="size-22 ring-[3.5px] ring-card shadow-xl shadow-primary/[0.08]">
              <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary/25 to-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Name + role badge */}
        <div className="pt-15 px-7 pb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{me.username}</h2>
            <Badge
              variant={me.role === "OWNER" ? "default" : "secondary"}
              className="text-[10px] font-semibold"
            >
              {me.role}
            </Badge>
          </div>
        </div>

        {/* Separator -- warm gradient style */}
        <div className="mx-7 mt-4 mb-1 h-px bg-gradient-to-r from-border/30 via-border/15 to-transparent" />

        {/* Info grid -- two-column on desktop */}
        <div className="p-7 pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {[
              { icon: User, label: "Username", value: me.username },
              { icon: Mail, label: "Email", value: me.email },
              { icon: Shield, label: "Role", value: me.role },
              { icon: Calendar, label: "Member since", value: createdDate },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 transition-colors duration-200 hover:bg-muted/15"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted/25 ring-1 ring-border/[0.06]">
                  <item.icon className="size-4 text-muted-foreground/55" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/45">
                    {item.label}
                  </p>
                  <p className="text-[14px] font-medium truncate mt-0.5">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
