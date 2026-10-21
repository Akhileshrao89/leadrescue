import { z } from "zod";

export const GenerateDraftInputSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
  leadId: z.string().uuid("Invalid lead ID"),
  touchpointType: z.enum([
    "FIRST_TOUCH",
    "POST_DISCOVERY",
    "PROPOSAL_CHECK_IN",
    "RE_ENGAGEMENT",
  ]),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "URGENT"]).default("FRIENDLY"),
  useAi: z.boolean().default(false),
});

export type GenerateDraftInputValues = z.infer<typeof GenerateDraftInputSchema>;
