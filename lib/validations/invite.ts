import { z } from "zod";

export const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  roleId: z.string().min(1, "Role is required"),
  /** Invitee's first name, used to personalize the invite email. Not stored — purely for email send. */
  inviteeName: z.string().max(80).optional(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
