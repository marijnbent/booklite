import { AccentPicker } from "@/components/AccentPicker";
import React from "react";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="mx-auto max-w-2xl space-y-5">
      <h1>Profile</h1>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-5">
          {/* User identity row */}
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback
                className="text-lg font-semibold"
                style={{ background: "linear-gradient(135deg, var(--ac), var(--ac2))", color: "var(--act)" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="truncate text-xl font-semibold tracking-tight">{me.username}</h2>
                <Badge variant={me.role === "OWNER" ? "default" : "secondary"}>
                  {me.role}
                </Badge>
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div className="mt-5 border-t border-border/50">
            <dl className="divide-y divide-border/50">
              {[
                { label: "Email", value: me.email ?? "Not set" },
                { label: "Member since", value: createdDate },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">{item.label}</dt>
                  <dd className="min-w-0 truncate text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <AccentPicker />
        </CardContent>
      </Card>
    </div>
  );
};
