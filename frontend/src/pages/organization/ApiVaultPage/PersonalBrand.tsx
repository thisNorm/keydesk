import { KeyRoundIcon } from "lucide-react";

import { cn } from "@app/components/v3/utils";

export const PersonalBrand = ({
  className,
  signature = false
}: {
  className?: string;
  signature?: boolean;
}) => (
  <span className={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
    <span className="flex size-7 items-center justify-center rounded-md border border-keydesk-accent/25 bg-keydesk-accent/10 text-keydesk-accent">
      <KeyRoundIcon className="size-3.5" aria-hidden />
    </span>
    <span className="font-mono text-base font-medium tracking-[-0.05em] text-foreground">
      Keydesk<span className="text-keydesk-accent">.</span>
    </span>
    {signature && (
      <span className="border-l border-border pl-2.5 font-mono text-[10px] text-muted">
        by Norm
      </span>
    )}
  </span>
);
