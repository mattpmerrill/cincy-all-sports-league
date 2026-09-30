"use client";

import * as React from "react";
import { cn } from "cn";
import { Switch as SwitchPrimitive } from "radix-ui";

/**
 * An on/off control that acts at once (`role="switch"` with `aria-checked`, from Radix). The
 * button itself is 44px tall and 56px wide so a thumb can hit it; the visible track inside is
 * smaller. Off and on differ by the thumb's position and the track's border and fill, so state
 * never depends on color alone, and the off border is the muted text color to stay visible
 * against the surface (WCAG 1.4.11).
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-text/60 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-12 items-center rounded-full border-2 border-text-muted bg-surface-high transition-colors group-data-[state=checked]/switch:border-brand-bright group-data-[state=checked]/switch:bg-brand motion-reduce:transition-none"
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="block size-4 translate-x-1 rounded-full bg-text-muted transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-on-brand motion-reduce:transition-none"
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
