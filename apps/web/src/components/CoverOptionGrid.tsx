import React from "react";
import { Check, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MetadataCoverOption } from "@/lib/metadata";

export interface CoverGridOption extends MetadataCoverOption {
  badgeLabel?: string;
  metaLabel: string;
}

interface CoverOptionGridProps {
  selectedCoverPath: string;
  options: CoverGridOption[];
  onSelectCover: (coverPath: string) => void;
  onClearCover: () => void;
  clearSelectedLabel: string;
  clearIdleLabel: string;
  clearMetaLabel?: string;
  selectedActionLabel?: string;
  idleActionLabel?: string;
  emptyState?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const CoverOptionGrid: React.FC<CoverOptionGridProps> = ({
  selectedCoverPath,
  options,
  onSelectCover,
  onClearCover,
  clearSelectedLabel,
  clearIdleLabel,
  clearMetaLabel = "No cover",
  selectedActionLabel = "Using this cover",
  idleActionLabel = "Click to select",
  emptyState,
  compact,
  className,
}) => {
  return (
    <div className={cn("grid", compact ? "gap-2" : "grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4", className)}>
      <button
        type="button"
        onClick={onClearCover}
        className={cn(
          "overflow-hidden border bg-card text-left transition-all duration-150",
          compact ? "rounded-lg" : "rounded-xl",
          !selectedCoverPath
            ? "border-primary ring-2 ring-primary/20"
            : "border-border/60 hover:border-primary/40 hover:bg-accent/20"
        )}
        aria-pressed={!selectedCoverPath}
      >
        <div className={cn("flex aspect-[2/3] items-center justify-center bg-muted/30")}>
          <ImageIcon className={cn(compact ? "size-5" : "size-8", "text-muted-foreground/40")} />
        </div>
        {!compact && (
          <div className="space-y-1 border-t border-border/40 px-3 py-2.5">
            <p className="text-xs font-medium">
              {!selectedCoverPath ? clearSelectedLabel : clearIdleLabel}
            </p>
            <p className="text-[11px] text-muted-foreground">{clearMetaLabel}</p>
          </div>
        )}
      </button>

      {options.length > 0
        ? options.map((option, index) => {
            const selectedCover = selectedCoverPath === option.coverPath;

            return (
              <button
                key={`${option.coverPath}-${index}`}
                type="button"
                onClick={() => onSelectCover(option.coverPath)}
                className={cn(
                  "group relative overflow-hidden border bg-card text-left transition-all duration-150",
                  compact ? "rounded-lg" : "rounded-xl",
                  selectedCover
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border/60 hover:border-primary/40 hover:bg-accent/20"
                )}
                aria-pressed={selectedCover}
              >
                <div className="relative aspect-[2/3] bg-muted/60">
                  <img
                    src={option.coverPath}
                    alt={`Cover option ${index + 1}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                  <div className={cn("absolute inset-x-0 top-0 flex items-start justify-between", compact ? "p-1" : "p-2")}>
                    {option.badgeLabel && !compact ? (
                      <Badge
                        variant={index === 0 ? "secondary" : "outline"}
                        className="bg-background/90 text-[10px] shadow-sm backdrop-blur"
                      >
                        {option.badgeLabel}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm transition-colors",
                        compact ? "size-5" : "size-6",
                        selectedCover && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      <Check className={cn(compact ? "size-3" : "size-3.5")} />
                    </span>
                  </div>
                </div>
                {!compact && (
                  <div className="space-y-1 border-t border-border/40 px-3 py-2.5">
                    <p className="text-xs font-medium">
                      {selectedCover ? selectedActionLabel : idleActionLabel}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{option.metaLabel}</p>
                  </div>
                )}
              </button>
            );
          })
        : emptyState}
    </div>
  );
};
