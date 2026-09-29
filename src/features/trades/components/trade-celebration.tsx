"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

const SEEN_PREFIX = "trade-celebrated:";

/**
 * Confetti in the league's own colors, read from the design tokens at runtime so no literal colors
 * live in code. canvas-confetti skips the animation when the viewer asks for reduced motion.
 */
function fire() {
  const root = getComputedStyle(document.documentElement);
  const colors = ["--brand", "--brand-bright", "--on-brand", "--gold", "--success"]
    .map((token) => root.getPropertyValue(token).trim())
    .filter(Boolean);
  const shared = { colors, disableForReducedMotion: true, ticks: 260 } as const;

  // One burst from the middle, then a cannon from each side a beat later.
  void confetti({
    ...shared,
    particleCount: 110,
    spread: 75,
    startVelocity: 42,
    origin: { y: 0.65 },
  });
  setTimeout(() => {
    void confetti({
      ...shared,
      particleCount: 60,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.8 },
    });
    void confetti({
      ...shared,
      particleCount: 60,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.8 },
    });
  }, 220);
}

// "Already celebrated" is a per-browser nicety, so storage failures (private mode, blocked site
// data) just mean the confetti might show again; they never throw.
function seen(offerId: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + offerId) !== null;
  } catch {
    return false;
  }
}

function markSeen(offerId: string) {
  try {
    window.localStorage.setItem(SEEN_PREFIX + offerId, "1");
  } catch {
    // See `seen`.
  }
}

/** Celebrate a trade the viewer just made, and remember it so the refreshed page doesn't repeat it. */
export function celebrateTrade(offerId: string) {
  markSeen(offerId);
  fire();
}

/**
 * Celebrates completed trades the first time this viewer sees them: the other side of an accept,
 * opening the page after the fact. One burst however many are new. Renders nothing.
 */
export function CelebrateTrade({ offerIds }: { offerIds: readonly string[] }) {
  const key = offerIds.join(",");
  useEffect(() => {
    const fresh = key.split(",").filter((id) => id && !seen(id));
    if (fresh.length === 0) return;
    fresh.forEach(markSeen);
    fire();
  }, [key]);
  return null;
}
