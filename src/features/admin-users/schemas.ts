import { z } from "zod";
import { USER_ROLES } from "@/domain/membership/membership";

export const changeRoleSchema = z.object({
  userId: z.uuid("That member isn't valid."),
  role: z.enum(USER_ROLES, "Choose a role."),
});
