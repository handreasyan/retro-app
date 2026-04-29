"use client";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import * as React from "react";

export function HelpTooltip({
  children,
  text,
  side = "bottom",
}: {
  children: React.ReactNode;
  text: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-50 shadow-soft dark:bg-zinc-100 dark:text-zinc-900"
            )}
          >
            {text}
            <TooltipPrimitive.Arrow className="fill-zinc-900 dark:fill-zinc-100" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
