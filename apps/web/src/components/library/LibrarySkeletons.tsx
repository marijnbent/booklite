import React from "react";

export const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="space-y-2.5">
        <div className="aspect-[2/3] rounded-lg bg-muted/40 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 rounded-full bg-muted/40 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded-full bg-muted/30 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

export const ListSkeleton: React.FC = () => (
  <div className="space-y-1">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
        <div className="h-12 w-8 shrink-0 rounded bg-muted/40" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-2/5 rounded bg-muted/40" />
          <div className="h-2.5 w-1/4 rounded bg-muted/30" />
        </div>
      </div>
    ))}
  </div>
);
