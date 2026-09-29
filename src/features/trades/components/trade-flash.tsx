"use client";

import { createContext, useContext, useState } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { FormMessage } from "@/ui/form-message";

const FlashContext = createContext<((state: FormState) => void) | null>(null);

/**
 * A message slot that outlives the buttons that fill it. Accepting or rejecting removes an offer
 * from a list, and its own inline message goes with it, so lists wrap their offers in this and the
 * outcome shows above them instead.
 */
export function TradeFlash({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FormState>(idleFormState);
  return (
    <FlashContext value={setState}>
      <FormMessage state={state} />
      {children}
    </FlashContext>
  );
}

/** Where to report an outcome: the surrounding `TradeFlash`, or null to show it inline instead. */
export const useFlash = () => useContext(FlashContext);
