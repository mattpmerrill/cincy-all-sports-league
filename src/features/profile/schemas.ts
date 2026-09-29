import { z } from "zod";
import { displayNameSchema } from "@/domain/membership/display-name";

export const updateDisplayNameSchema = z.object({ displayName: displayNameSchema });
