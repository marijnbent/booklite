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
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account information
      </p>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-5">
          {/* User identity row */}
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-semibold tracking-tight">{me.username}</h2>
                <Badge variant={me.role === "OWNER" ? "default" : "secondary"}>
                  {me.role}
                </Badge>
              </div>
              {me.email && (
                <p className="text-sm text-muted-foreground mt-0.5">{me.email}</p>
              )}
            </div>
          </div>

          {/* Info rows */}
          <div className="mt-6 border-t border-border/50">
            <dl className="divide-y divide-border/50">
              {[
                { label: "Username", value: me.username },
                { label: "Email", value: me.email },
                { label: "Role", value: me.role },
                { label: "Member since", value: createdDate },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3">
                  <dt className="text-sm text-muted-foreground">{item.label}</dt>
                  <dd className="text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
