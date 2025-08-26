import { z } from "zod";

export const keySchema = z.object({
  kid: z.string(),
  status: z.enum(["active", "deprecated", "expired", "revoked"]),
  createdAt: z.number(),
  expiresAt: z.number(),
  deprecatedAt: z.number().nullable(),
  expiredAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
  removedAt: z.number().nullable(),
  keyPath: z.string().nullable(),
});

export const metadataSchema = z.object({
  keys: z.array(keySchema),
});

export type Key = z.infer<typeof keySchema>;
export type Metadata = z.infer<typeof metadataSchema>;
