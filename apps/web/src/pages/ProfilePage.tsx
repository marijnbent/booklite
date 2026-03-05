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
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account information
        </p>
      </div>

      <Card className="border-border/40 overflow-hidden">
        {/* Profile header with gradient banner */}
        <div className="relative h-24 bg-gradient-to-r from-primary/10 via-primary/[0.06] to-transparent">
          <div className="absolute -bottom-8 left-6">
            <Avatar className="size-16 ring-4 ring-card shadow-lg">
              <AvatarFallback className="text-lg bg-primary/15 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <CardHeader className="pt-12 pb-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl">{me.username}</CardTitle>
            <Badge variant={me.role === "OWNER" ? "default" : "secondary"}>
              {me.role}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-0">
          <Separator className="mb-5" />

          {/* Info rows */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Username
                </p>
                <p className="text-sm font-medium">{me.username}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
                <Mail className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Email
                </p>
                <p className="text-sm font-medium">{me.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
                <Shield className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Role
                </p>
                <p className="text-sm font-medium">{me.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
                <Calendar className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Member since
                </p>
                <p className="text-sm font-medium">{createdDate}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
