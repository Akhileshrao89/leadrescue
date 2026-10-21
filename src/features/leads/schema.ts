import { z } from "zod";

export const LeadFormSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100),
    lastName: z.string().trim().max(100).optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("Please enter a valid email address")
      .max(255)
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    companyName: z.string().trim().max(150).optional().or(z.literal("")),
    website: z
      .string()
      .trim()
      .url("Please enter a valid website URL (e.g. https://example.com)")
      .max(255)
      .optional()
      .or(z.literal("")),
    stage: z
      .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
      .default("NEW"),
    source: z.string().trim().max(50).default("manual"),
    notes: z.string().trim().max(50000).optional().or(z.literal("")),
    nextFollowUpAt: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) =>
      (data.email && data.email.length > 0) ||
      (data.phone && data.phone.length > 0),
    {
      message: "At least one contact method (email or phone) is required",
      path: ["email"],
    },
  );

export type LeadFormValues = z.infer<typeof LeadFormSchema>;

export const UpdateLeadSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100)
    .optional(),
  lastName: z.string().trim().max(100).optional().nullable(),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .max(255)
    .optional()
    .nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  companyName: z.string().trim().max(150).optional().nullable(),
  website: z.string().trim().max(255).optional().nullable(),
  source: z.string().trim().max(50).optional().nullable(),
  notes: z.string().trim().max(50000).optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  expectedVersion: z.number().int().positive().optional(),
});

export type UpdateLeadValues = z.infer<typeof UpdateLeadSchema>;

export const CompleteFollowUpSchema = z.object({
  outcomeNote: z.string().trim().min(1, "Outcome note is required").max(5000),
  newStage: z
    .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
    .optional(),
  nextFollowUpAt: z.string().optional().nullable(),
});

export type CompleteFollowUpValues = z.infer<typeof CompleteFollowUpSchema>;

export const RescheduleFollowUpSchema = z.object({
  nextFollowUpAt: z.string().min(1, "Follow-up date is required"),
  reason: z.string().trim().max(500).optional(),
});

export type RescheduleFollowUpValues = z.infer<typeof RescheduleFollowUpSchema>;

export const AddNoteSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty").max(50000),
});

export type AddNoteValues = z.infer<typeof AddNoteSchema>;
