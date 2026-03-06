import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/8 text-primary border border-primary/15",
        secondary: "bg-secondary text-secondary-foreground border border-border/40",
        destructive: "bg-destructive/8 text-destructive border border-destructive/15",
        outline: "border border-border/60 text-muted-foreground",
        success: "bg-status-completed/10 text-status-completed border border-status-completed/20",
        warning: "bg-status-queued/10 text-status-queued border border-status-queued/20",
        info: "bg-status-processing/10 text-status-processing border border-status-processing/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
