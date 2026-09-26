import { z } from "zod";

// POST /sync/push response (07-api-contract.md "Push").
export const pushResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["accepted", "duplicate", "flagged", "rejected"]),
      flags: z.array(z.string()).optional(),
      code: z.string().optional(),
      message: z.string().optional(),
    }),
  ),
});
