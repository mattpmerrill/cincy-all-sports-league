"use client";

import { createContext, useContext, useState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { FormMessage } from "@/ui/form-message";

const FlashContext = createContext<((state: FormState) => void) | null>(null);

/**
 * A message slot that outlives the buttons that fill it. Accepting an offer or picking up a free
 * agent removes a row from a list, and its own inline message goes with it, so lists wrap their
 * rows in this and the outcome shows above them instead.
 */
export function FlashSlot({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FormState>(idleFormState);
  return (
    <FlashContext value={setState}>
      <FormMessage state={state} />
      {children}
    </FlashContext>
  );
}

/** Where to report an outcome: the surrounding `FlashSlot`, or null to show it inline instead. */
export const useFlash = () => useContext(FlashContext);
