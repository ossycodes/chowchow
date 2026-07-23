import { z } from "zod";

export const ActorType = {
  Customer: "customer",
  Vendor: "vendor",
  Rider: "rider",
  Admin: "admin",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const IdentityEventType = {
  UserRegistered: "user.registered",
} as const;

export const userRegisteredSchema = z.object({
  userId: z.string().uuid(),
  actorType: z.nativeEnum(ActorType),
  email: z.string().email(),
  phone: z.string().optional(),
});
export type UserRegistered = z.infer<typeof userRegisteredSchema>;
