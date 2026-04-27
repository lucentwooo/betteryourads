"use client";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/utils";

function Collapsible({
  className,
  ...props
}: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn("group", className)}
      {...props}
    />
  );
}

function CollapsibleTrigger({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "group/trigger flex w-full items-center justify-between gap-6 border-y hairline py-6 text-left transition-colors hover:bg-paper/50 data-[panel-open]:border-b-0",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsiblePanel({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        "overflow-hidden transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0",
        "data-[open]:border-b hairline",
        className,
      )}
      {...props}
    >
      <div className="py-10">{children}</div>
    </CollapsiblePrimitive.Panel>
  );
}

/* Convenience wrapper used by the analyze page: eyebrow + 1-line teaser
   + chevron in the trigger, content slot in the panel. */
function CollapsibleSection({
  eyebrow,
  title,
  teaser,
  defaultOpen = false,
  children,
}: {
  eyebrow: string;
  title: string;
  teaser?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-ink/55">{eyebrow}</div>
          <div className="mt-2 font-semibold text-2xl leading-snug text-ink md:text-[1.75rem]">
            {title}
          </div>
          {teaser && (
            <div className="mt-2 text-sm text-ink/55">{teaser}</div>
          )}
        </div>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink/45 transition-transform group-data-[panel-open]/trigger:rotate-90"
        >
          ▸
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>{children}</CollapsiblePanel>
    </Collapsible>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
  CollapsibleSection,
};
