import { cn } from "@/lib/utils";

export const BookLiteLogo = ({ className, decorative = false }: {
  className?: string;
  decorative?: boolean;
}) => (
  <span
    className={cn("booklite-logo size-[18px] shrink-0", className)}
    role={decorative ? undefined : "img"}
    aria-label={decorative ? undefined : "BookLite"}
    aria-hidden={decorative || undefined}
  />
);
