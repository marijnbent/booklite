import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border border-primary/20",
        secondary: "bg-secondary text-secondary-foreground border border-border/50",
        destructive: "bg-destructive/10 text-destructive border border-destructive/20",
        outline: "border border-border text-foreground",
        success: "bg-status-completed/15 text-status-completed border border-status-completed/25",
        warning: "bg-status-queued/15 text-status-queued border border-status-queued/25",
        info: "bg-status-processing/15 text-status-processing border border-status-processing/25",
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
