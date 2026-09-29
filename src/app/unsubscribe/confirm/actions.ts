"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUnsubscribeService } from "@/features/digest/unsubscribe.server";
import { formText } from "@/lib/form-state";

const inputSchema = z.object({
  t: z.string().min(1).max(512),
  intent: z.enum(["unsubscribe", "resubscribe"]),
});

// No session here by design: the emailed token is the credential, verified by the service. A bad
// token changes nothing, and the page re-renders to show the current state either way.
export async function changeWeeklyEmailAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    t: formText(formData, "t"),
    intent: formText(formData, "intent"),
  });
  if (!parsed.success) return;
  const service = getUnsubscribeService();
  if (!service) return;
  await (parsed.data.intent === "unsubscribe"
    ? service.unsubscribe(parsed.data.t)
    : service.resubscribe(parsed.data.t));
  revalidatePath("/unsubscribe/confirm");
}
