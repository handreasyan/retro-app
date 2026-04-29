"use client";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Avatar } from "./Avatar";
import { descriptionFor, ANONYMOUS_DESCRIPTION } from "@/lib/personas";
import type { Persona } from "@/server/types";

export function PersonaAvatar({
  persona,
  size = 24,
  className = "",
  disableHover = false,
}: {
  persona: Persona;
  size?: number;
  className?: string;
  disableHover?: boolean;
}) {
  if (disableHover) {
    return <Avatar src={persona.avatar} alt={persona.name} size={size} className={className} />;
  }
  const description = persona.kind === "anonymous"
    ? ANONYMOUS_DESCRIPTION
    : (descriptionFor(persona.slug) ?? "");

  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span className={`inline-block ${className}`}>
          <Avatar src={persona.avatar} alt={persona.name} size={size} />
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="center"
          sideOffset={8}
          className="z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-soft data-[state=open]:animate-in"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar src={persona.avatar} alt={persona.name} size={256} className="!h-48 sm:!h-64 !w-48 sm:!w-64" />
            <div className="font-semibold text-lg leading-tight">{persona.name}</div>
            {description && (
              <p className="text-sm text-[var(--color-muted)] leading-snug">{description}</p>
            )}
          </div>
          <HoverCard.Arrow className="fill-[var(--color-bg-elev)]" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
