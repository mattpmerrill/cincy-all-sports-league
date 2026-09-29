"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsOf } from "@/domain/membership/membership";
import { cn } from "cn";

const SIZES = {
  sm: { box: "size-9", px: 36, text: "text-sm" },
  md: { box: "size-14", px: 56, text: "text-xl" },
  lg: { box: "size-20", px: 80, text: "text-3xl" },
} as const;

/**
 * A team logo or athlete headshot. Falls back to initials when there is no image (eight WTA
 * players have none) or it fails to load, so a card never shows a broken picture.
 */
export function ParticipantImage({
  name,
  src,
  kind,
  size = "md",
  className,
}: {
  name: string;
  src: string | null;
  kind: "team" | "athlete";
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const { box, px, text } = SIZES[size];
  const shape = kind === "athlete" ? "rounded-full" : "rounded-lg";

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center bg-surface-high font-display font-bold text-text-muted ring-1 ring-line",
          box,
          text,
          shape,
          className,
        )}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={px}
      height={px}
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0",
        box,
        shape,
        kind === "athlete" ? "bg-surface-high object-cover object-top" : "object-contain",
        className,
      )}
    />
  );
}
